#!/usr/bin/env python3
"""Inspect Cloudflare and dry-run changes via cf. Pass --apply to write."""
import argparse
import json
import os
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from readiness import load_readiness
from render import ORIGIN_IP, cache_rules, hostname, reserved_host

PHASE = 'http_request_cache_settings'
PREFIX = ['rulesets', 'account-rulesets']
RULESET_PAGE_SIZE = 50


def merge_rules(existing, desired):
    refs = {rule['ref'] for rule in desired}
    wanted = {rule['ref']: rule for rule in desired}
    for rule in existing:
        if rule.get('ref') in refs and rule.get('expression') != wanted[rule['ref']]['expression']:
            raise ValueError('A melon rule ref already belongs to a different expression; review manually.')
    # Append our host-scoped rules last, preserving unrelated rules and their order.
    fields = {'id', 'ref', 'action', 'action_parameters', 'expression', 'description', 'enabled', 'logging', 'ratelimit'}
    others = [{key: value for key, value in rule.items() if key in fields}
              for rule in existing if rule.get('ref') not in refs]
    merged = others + desired
    if len(merged) > 10:
        raise ValueError('Free-plan cache-rule budget would be exceeded; no upgrade will be purchased.')
    return merged


def host_in_zone(host, zone):
    return host == zone or host.endswith('.' + zone)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--host', required=True)
    p.add_argument('--zone', required=True, help='Existing active zone ID')
    p.add_argument('--action', choices=['dns-direct', 'edge', 'proxy-on', 'proxy-off'], required=True)
    p.add_argument('--snapshot-dir', type=Path, required=True)
    p.add_argument('--apply', action='store_true')
    p.add_argument('--readiness', type=Path, help='Private approved filing/contact record; required with --apply')
    args = p.parse_args()
    host = hostname(args.host)
    if reserved_host(host):
        p.error('Supply the purchased hostname, not an example.')
    if args.apply:
        try:
            load_readiness(args.readiness, host)
        except (ValueError, OSError) as error:
            p.error(str(error))
    cf = os.environ.get('CF_BIN') or shutil.which('cf') or str(Path.home() / '.local/bin/cf')

    def call(command, body=None, mutation=False):
        argv = [cf] + command + ['--zone', args.zone]
        if body is not None:
            argv += ['--body', json.dumps(body)]
        if mutation and not args.apply:
            argv += ['--dry-run']
        result = subprocess.run(argv, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
        return json.loads(result.stdout) if result.stdout.strip() else None

    zone = call(['zones', 'get'])
    if zone['status'] != 'active' or not host_in_zone(host, zone['name']):
        p.error('Hostname must equal or be a subdomain of the selected active zone.')
    records = call(['dns', 'records', 'list', '--name', host, '--per-page', '100'])
    if len(records) >= 100:
        p.error('DNS listing may be incomplete; inspect manually.')
    conflicting = [r for r in records if r['type'] in ('AAAA', 'CNAME', 'NS', 'HTTPS', 'SVCB')]
    addresses = [r for r in records if r['type'] == 'A']
    if conflicting or len(addresses) > 1 or any(r['content'] != ORIGIN_IP for r in addresses):
        p.error('Conflicting DNS exists; refusing to replace it.')
    if args.action == 'dns-direct' and addresses and addresses[0].get('proxied'):
        p.error('Already proxied. Use the documented rollback sequence with proxy-off.')
    state = {'zone': zone, 'records': records, 'action': args.action, 'host': host}
    actions = []
    if args.action == 'edge':
        settings = {'ssl': 'strict', 'always_use_https': 'on', 'rocket_loader': 'off'}
        state['settings'] = {name: call(['zones', 'settings', 'get', name]) for name in settings}
        rulesets = call(PREFIX + ['list', '--per-page', str(RULESET_PAGE_SIZE)])
        if len(rulesets) >= RULESET_PAGE_SIZE:
            p.error('Ruleset listing may be incomplete; inspect manually.')
        cache = [r for r in rulesets if r.get('phase') == PHASE and r.get('kind') == 'zone']
        if len(cache) > 1:
            p.error('Ambiguous cache rulesets.')
        current = call(PREFIX + ['get', cache[0]['id']]) if cache else None
        state['cache_ruleset'] = current
        body = {'name': current['name'] if current else 'Melon cache policy',
                'kind': 'zone', 'phase': PHASE,
                'rules': merge_rules(current.get('rules', []) if current else [], cache_rules(host))}
        actions.append((PREFIX + (['update', current['id']] if current else ['create']), body))
        actions.extend((['zones', 'settings', 'edit', name], {'value': value}) for name, value in settings.items())
    else:
        proxied = args.action == 'proxy-on'
        if args.action in ('proxy-on', 'proxy-off') and not addresses:
            p.error('DNS record must already exist before switching proxy mode.')
        if proxied:
            if call(['zones', 'settings', 'get', 'ssl'])['value'] != 'strict':
                p.error('Full (strict) must be configured before enabling proxy.')
            cache = call(PREFIX + ['phases', 'get', PHASE])
            rules = cache.get('rules', [])
            for wanted in cache_rules(host):
                actual = next((r for r in rules if r.get('ref') == wanted['ref']), None)
                if not actual or any(actual.get(k) != wanted[k] for k in ('expression', 'action', 'action_parameters', 'enabled')):
                    p.error('Required cache policy is not installed; run edge first.')
        body = {'type': 'A', 'name': host, 'content': ORIGIN_IP, 'proxied': proxied, 'ttl': 1 if proxied else 300}
        actions.append((['dns', 'records'] + (['edit', addresses[0]['id']] if addresses else ['create']), body))
    args.snapshot_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    saved = args.snapshot_dir / (datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.json')
    with saved.open('x') as output:
        os.chmod(saved, 0o600)
        json.dump(state, output, indent=2)
    for command, body in actions:
        result = call(command, body, mutation=True)
        print(json.dumps(result if not args.apply else {'applied': ' '.join(command)}, indent=2))
    print('Previous state:', saved)
    if not args.apply:
        print('Dry run only. No Cloudflare resources changed.')


if __name__ == '__main__':
    main()
