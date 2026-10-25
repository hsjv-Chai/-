#!/usr/bin/env python3
"""Run on ECS as root. Apply a reviewed bundle or restore its exact snapshot."""
import argparse
import json
import os
import re
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from readiness import load_readiness
from render import digest, hostname, official_ranges, reserved_host

ROOT = Path('/opt/melon')
NGINX = Path('/opt/moye/deploy/nginx.conf')
CERTIFICATES = Path('/opt/moye/deploy/letsencrypt/live')
FILES = {'nginx.conf': NGINX, 'compose.yml': ROOT / 'compose.yml', '.env': ROOT / '.env'}


def run(*args):
    subprocess.run(args, check=True, cwd=ROOT)


def reload_nginx():
    run('docker', 'exec', 'moye-nginx-1', 'nginx', '-t')
    run('docker', 'exec', 'moye-nginx-1', 'nginx', '-s', 'reload')


def restore(snapshot):
    # The file is bind-mounted: write in place rather than replacing its inode.
    for name, target in FILES.items():
        target.write_text((snapshot / name).read_text())
        if name == '.env':
            target.chmod(0o600)
    run('docker', 'compose', 'up', '-d', 'app')
    reload_nginx()


def root_compose(compose):
    literal = 'MELON_PUBLIC_ORIGIN: https://114.215.182.66'
    parameter = 'MELON_PUBLIC_ORIGIN: ${MELON_PUBLIC_ORIGIN:-https://114.215.182.66}'
    if compose.count(literal) + compose.count(parameter) != 1:
        raise ValueError('Unknown origin configuration; review Compose before activation.')
    compose = compose.replace(literal, parameter)
    base = 'NEXT_PUBLIC_BASE_PATH: ${MELON_BASE_PATH-/melon}'
    if compose.count('NEXT_PUBLIC_BASE_PATH: /melon') + compose.count(base) != 1:
        raise ValueError('Unknown path configuration; review Compose before activation.')
    compose = compose.replace('NEXT_PUBLIC_BASE_PATH: /melon', base)
    if 'MELON_ICP_NUMBER:' not in compose:
        compose = compose.replace(base, base + '\n      MELON_ICP_NUMBER: ${MELON_ICP_NUMBER-}')
    elif compose.count('MELON_ICP_NUMBER: ${MELON_ICP_NUMBER-}') != 1:
        raise ValueError('Unknown filing number configuration.')
    old = "fetch('http://127.0.0.1:3000/melon/api/health')"
    new = "fetch('http://127.0.0.1:3000'+(process.env.NEXT_PUBLIC_BASE_PATH||'')+'/api/health')"
    if compose.count(old) + compose.count(new) != 1:
        raise ValueError('Unknown health check; review Compose before activation.')
    return compose.replace(old, new)


def replace_env(env, values):
    for key, value in values.items():
        pattern = r'^' + re.escape(key) + r'=.*$'
        if len(re.findall(pattern, env, re.M)) > 1:
            raise ValueError('Duplicate variable: ' + key)
        line = key + '=' + value
        env = re.sub(pattern, lambda _: line, env, flags=re.M) if re.search(pattern, env, re.M) else env.rstrip() + '\n' + line + '\n'
    return env


def check_image(image):
    if not re.fullmatch(r'melon-community:[a-zA-Z0-9._-]+', image or ''):
        raise ValueError('Supply --image with the tested root-path melon-community image.')
    value = json.loads(subprocess.check_output(['docker', 'image', 'inspect', image, '--format', '{{json .Config}}'], universal_newlines=True))
    if value.get('Labels', {}).get('io.melon.base-path') != '' or 'NEXT_PUBLIC_BASE_PATH=' not in value.get('Env', []):
        raise ValueError('Image was not built for the root path; use --build-arg BASE_PATH=.')


def ensure_idle():
    code = "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('/data/melon.sqlite',{readOnly:true});const r=d.prepare(\"SELECT count(*) AS n FROM game_rooms WHERE phase IN ('bidding','tribute','return','playing') AND updated_at>?\").get(Date.now()-7*86400000);if(r.n){console.error('Active games; activation deferred');process.exit(3)}"
    run('docker', 'exec', 'melon-app-1', 'node', '-e', code)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    command = p.add_mutually_exclusive_group(required=True)
    command.add_argument('--bundle', type=Path)
    command.add_argument('--restore', type=Path)
    p.add_argument('--image', help='Tested root-path image; required for direct/proxied activation')
    p.add_argument('--readiness', type=Path, help='Private approved filing/contact record')
    args = p.parse_args()
    if os.geteuid() != 0:
        p.error('Run this command with sudo on ECS.')
    if args.restore:
        state = json.loads((args.restore / 'applied.json').read_text())
        if any(digest(target.read_text()) != state[name] for name, target in FILES.items()):
            p.error('Files changed after activation. Review the diff before manual rollback.')
        restore(args.restore)
        print('Restored', args.restore)
        return
    bundle = args.bundle.resolve()
    meta = json.loads((bundle / 'manifest.json').read_text())
    host = hostname(meta['host'])
    mode = meta['mode']
    if reserved_host(host) or mode not in ('acme', 'direct', 'proxied'):
        p.error('A real purchased hostname and a valid mode are required.')
    if meta.get('base_path') != '':
        p.error('Bundle is not a root-path bundle; render with the current scripts.')
    try:
        readiness = load_readiness(args.readiness, host)
        if mode != 'acme':
            check_image(args.image)
    except (ValueError, OSError) as error:
        p.error(str(error))
    age = datetime.now(timezone.utc).timestamp() - float(meta['created_epoch'])
    if age > 86400 or age < -300:
        p.error('Bundle is over 24 hours old. Render again from current configuration.')
    if meta['ranges'] != official_ranges():
        p.error('Cloudflare ranges changed; render a fresh bundle.')
    config = (bundle / 'nginx.conf').read_text()
    if digest(config) != meta['nginx_sha256'] or digest(NGINX.read_text()) != meta['base_sha256']:
        p.error('Bundle or live Nginx changed. Regenerate and review the configuration.')
    if any((ROOT / name).exists() for name in ('compose.override.yml', 'compose.override.yaml', 'docker-compose.override.yml')):
        p.error('Unexpected Compose override: inspect precedence before activation.')
    if mode != 'acme':
        for name in ('fullchain.pem', 'privkey.pem'):
            if not (CERTIFICATES / host / name).is_file():
                p.error('Issue the domain certificate before activating HTTPS.')
    compose = FILES['compose.yml'].read_text()
    env = FILES['.env'].read_text()
    if mode != 'acme':
        try:
            compose = root_compose(compose)
            env = replace_env(env, {'MELON_PUBLIC_ORIGIN': 'https://' + host, 'MELON_BASE_PATH': '',
                                   'MELON_IMAGE': args.image, 'MELON_ICP_NUMBER': readiness['icp_number']})
        except ValueError as error:
            p.error(str(error))
    ensure_idle()
    snapshot = ROOT / 'backups' / ('cloudflare-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    snapshot.mkdir(parents=True, mode=0o700)
    for name, target in FILES.items():
        saved = snapshot / name
        saved.write_text(target.read_text())
        saved.chmod(0o600)
    run('sh', str(ROOT / 'backup-ecs.sh'))
    try:
        NGINX.write_text(config)
        run('docker', 'exec', 'moye-nginx-1', 'nginx', '-t')
        if mode != 'acme':
            FILES['compose.yml'].write_text(compose)
            FILES['.env'].write_text(env)
            FILES['.env'].chmod(0o600)
            run('docker', 'compose', 'up', '-d', 'app')
            for _ in range(30):
                result = subprocess.run(['curl', '--noproxy', '*', '-fsS', '--max-time', '2', 'http://127.0.0.1:3100/api/health'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                if result.returncode == 0:
                    break
                time.sleep(1)
            else:
                raise RuntimeError('Application health check failed.')
        reload_nginx()
        if mode != 'acme':
            # Direct uses the origin certificate. Proxied must already resolve via Cloudflare.
            command = ['curl', '--noproxy', '*', '-fsS', '--max-time', '10']
            if mode == 'direct':
                command += ['--resolve', f'{host}:443:127.0.0.1']
            for _ in range(5):
                response = subprocess.run(command + [f'https://{host}/api/health'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                if response.returncode == 0:
                    break
                time.sleep(1)
            else:
                raise RuntimeError('Public hostname health check failed after Nginx reload.')
        applied = {name: digest(target.read_text()) for name, target in FILES.items()}
        (snapshot / 'applied.json').write_text(json.dumps(applied, indent=2))
        print(f'Activated {mode}. Rollback snapshot: {snapshot}')
    except BaseException:
        print('Activation failed; restoring the saved configuration.')
        restore(snapshot)
        raise


if __name__ == '__main__':
    main()
