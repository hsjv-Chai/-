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
from render import digest, hostname, official_ranges, reserved_host

ROOT = Path('/opt/melon')
NGINX = Path('/opt/moye/deploy/nginx.conf')
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
    run('docker', 'compose', 'up', '-d', 'app')
    reload_nginx()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    command = p.add_mutually_exclusive_group(required=True)
    command.add_argument('--bundle', type=Path)
    command.add_argument('--restore', type=Path)
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
            if not (Path('/opt/moye/deploy/letsencrypt/live') / host / name).is_file():
                p.error('Issue the domain certificate before activating HTTPS.')
    compose = FILES['compose.yml'].read_text()
    literal = 'MELON_PUBLIC_ORIGIN: https://114.215.182.66'
    parameter = 'MELON_PUBLIC_ORIGIN: ${MELON_PUBLIC_ORIGIN:-https://114.215.182.66}'
    if compose.count(literal) + compose.count(parameter) != 1:
        p.error('Unknown origin configuration. Refusing to edit Compose.')
    env = FILES['.env'].read_text()
    if len(re.findall(r'^MELON_PUBLIC_ORIGIN=', env, re.M)) > 1:
        p.error('Duplicate origin variables in .env')
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
            FILES['compose.yml'].write_text(compose.replace(literal, parameter))
            line = f'MELON_PUBLIC_ORIGIN=https://{host}'
            env = re.sub(r'^MELON_PUBLIC_ORIGIN=.*$', line, env, flags=re.M) if re.search(r'^MELON_PUBLIC_ORIGIN=', env, re.M) else env.rstrip() + '\n' + line + '\n'
            FILES['.env'].write_text(env)
            FILES['.env'].chmod(0o600)
            run('docker', 'compose', 'up', '-d', 'app')
            for _ in range(30):
                result = subprocess.run(['curl', '-fsS', '--max-time', '2', 'http://127.0.0.1:3100/melon/api/health'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                if result.returncode == 0:
                    break
                time.sleep(1)
            else:
                raise RuntimeError('Application health check failed.')
        reload_nginx()
        if mode != 'acme':
            # Direct uses the origin certificate. Proxied must already resolve via Cloudflare.
            command = ['curl', '-fsS', '--max-time', '10']
            if mode == 'direct':
                command += ['--resolve', f'{host}:443:127.0.0.1']
            for _ in range(5):
                response = subprocess.run(command + [f'https://{host}/melon/api/health'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
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
