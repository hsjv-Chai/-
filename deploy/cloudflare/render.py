#!/usr/bin/env python3
"""Render a reviewable bundle. No server, DNS or account changes are made."""
import argparse
import hashlib
import ipaddress
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ORIGIN_IP = '114.215.182.66'
OLD_BEGIN = '  # BEGIN melon-community'
OLD_END = '  # END melon-community'
BEGIN = '# BEGIN melon-cloudflare'
END = '# END melon-cloudflare'


def digest(text):
    return hashlib.sha256(text.encode()).hexdigest()


def hostname(value):
    value = value.lower()
    if len(value) > 253 or not re.fullmatch(r'(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}', value):
        raise ValueError('Use an ASCII DNS hostname, without scheme, port or path.')
    return value


def reserved_host(host):
    return any(host == suffix or host.endswith('.' + suffix) for suffix in
               ('example.com', 'example.net', 'example.org', 'localhost', 'test', 'invalid'))


def official_ranges():
    ranges = []
    for family in (4, 6):
        # Use the OS trust store through curl, including on Python.org macOS installs.
        values = subprocess.check_output([
            'curl', '--proto', '=https', '--proto-redir', '=https', '-fsSL', '--max-time', '20',
            f'https://www.cloudflare.com/ips-v{family}',
        ], universal_newlines=True).split()
        if not values:
            raise ValueError('Empty Cloudflare IP list; refusing to render.')
        for value in values:
            network = ipaddress.ip_network(value, strict=True)
            if network.version != family or network.prefixlen == 0 or not network.is_global:
                raise ValueError('Invalid Cloudflare network list.')
            ranges.append(str(network))
    return sorted(set(ranges))


def replace_block(text, begin, end, replacement):
    if text.count(begin) != 1 or text.count(end) != 1:
        raise ValueError(f'Expected exactly one managed block: {begin}')
    start, stop = text.index(begin), text.index(end) + len(end)
    if stop < start:
        raise ValueError('Invalid block order')
    return text[:start] + replacement + text[stop:]


def cache_rules(host):
    static = '(starts_with(http.request.uri.path, "/_next/static/") and (ends_with(http.request.uri.path, ".js") or ends_with(http.request.uri.path, ".css")))'
    return [
        {'ref': 'melon_static_v1', 'description': 'Melon: versioned JS/CSS only',
         'expression': f'(http.host eq "{host}" and {static} and http.request.method in {{"GET" "HEAD"}})',
         'action': 'set_cache_settings', 'action_parameters': {
             'cache': True, 'edge_ttl': {'mode': 'bypass_by_default'},
             'browser_ttl': {'mode': 'respect_origin'}}, 'enabled': True},
        {'ref': 'melon_private_v1', 'description': 'Melon: bypass all other content',
         'expression': f'(http.host eq "{host}" and (not {static} or not http.request.method in {{"GET" "HEAD"}}))',
         'action': 'set_cache_settings', 'action_parameters': {'cache': False}, 'enabled': True},
    ]


def render(base, host, mode, ranges):
    host = hostname(host)
    if mode not in ('acme', 'direct', 'proxied'):
        raise ValueError('Unknown mode')
    if BEGIN in base or END in base:
        base = replace_block(base, BEGIN, END, '').rstrip() + '\n'
    if base.count(OLD_BEGIN) != 1 or base.count(OLD_END) != 1:
        raise ValueError('Original forum route missing or ambiguous.')
    if mode == 'acme':
        # Bootstrap only the challenge vhost. Leave the live forum route intact.
        if 'return 302 https://' in base[base.index(OLD_BEGIN):base.index(OLD_END)]:
            raise ValueError('ACME bootstrap is only valid before domain activation.')
        return base.rstrip() + f'''

{BEGIN}
server {{
  listen 80;
  server_name {host};
  location ^~ /.well-known/acme-challenge/ {{ root /var/www/acme; }}
  location / {{ return 404; }}
}}
{END}
'''
    legacy = f'''  location ~ ^/melon(?:/|$) {{
    default_type application/json;
    add_header Cache-Control "no-store" always;
    if ($request_method !~ ^(GET|HEAD)$) {{ return 410 '{{"error":"论坛已迁移，请打开新域名后重试"}}'; }}
    return 302 https://{host}$melon_legacy_target;
  }}'''
    old_route = OLD_BEGIN + '\n' + legacy + '\n' + OLD_END
    base = replace_block(base, OLD_BEGIN, OLD_END, old_route)
    nets = '\n'.join(f'  {ipaddress.ip_network(cidr)} 1;' for cidr in ranges)
    trusts = '\n'.join(f'  set_real_ip_from {ipaddress.ip_network(cidr)};' for cidr in ranges)
    gate = '  if ($melon_cf_peer = 0) { return 403; }' if mode == 'proxied' else ''
    return base.rstrip() + f'''

{BEGIN}
# Use the raw URI so escaped paths and query strings survive the redirect.
map $request_uri $melon_legacy_target {{
  default /;
  ~^/melon(?<melon_legacy_tail>/.*)$ $melon_legacy_tail;
  ~^/melon(?<melon_legacy_query>\\?.*)$ /$melon_legacy_query;
}}
# Evaluate the socket peer, not the client IP rewritten by ngx_http_realip_module.
geo $realip_remote_addr $melon_cf_peer {{
  default 0;
{nets}
}}
map "$request_method:$uri" $melon_auth_key {{
  default "";
  ~^POST:/api/auth/(login|register)/?$ $binary_remote_addr;
}}
limit_req_zone $melon_auth_key zone=melon_auth:10m rate=10r/m;
map "$uri:$upstream_status" $melon_response_cache {{
  default "private, no-store";
  ~^/_next/static/.*\\.(js|css):(200|304)$ "public, max-age=31536000, immutable";
}}
log_format melon_cf '$time_iso8601 host=$host peer=$realip_remote_addr client=$remote_addr '
                    '"$request" status=$status ray=$http_cf_ray';
server {{
  listen 80;
  server_name {host};
  location ^~ /.well-known/acme-challenge/ {{ root /var/www/acme; }}
{legacy}
  location / {{ return 308 https://{host}$request_uri; }}
}}
server {{
  listen 443 ssl;
  server_name {host};
  ssl_certificate /etc/letsencrypt/live/{host}/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/{host}/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
{trusts}
  real_ip_header CF-Connecting-IP;
  real_ip_recursive off;
{gate}
  if ($host != {host}) {{ return 421; }}
  access_log /var/log/nginx/access.log melon_cf;
  client_max_body_size 6m;
  error_page 429 = @melon_rate_limited;
  add_header X-Content-Type-Options nosniff always;
  add_header Referrer-Policy strict-origin-when-cross-origin always;
  add_header Cache-Control $melon_response_cache always;
  location @melon_rate_limited {{
    default_type application/json;
    add_header Cache-Control "no-store" always;
    add_header Retry-After 60 always;
    return 429 '{{"error":"请求过于频繁，请稍后再试"}}';
  }}
{legacy}
  location ^~ /.well-known/acme-challenge/ {{ root /var/www/acme; }}
  location / {{
    limit_req zone=melon_auth burst=10 nodelay;
    limit_req_status 429;
    resolver 127.0.0.11 valid=10s ipv6=off;
    set $melon_upstream melon-app:3000;
    proxy_pass http://$melon_upstream;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header Connection "";
    proxy_hide_header Cache-Control;
    proxy_read_timeout 60s;
    proxy_send_timeout 60s;
    proxy_buffering off;
  }}
}}
{END}
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', required=True)
    parser.add_argument('--mode', required=True, choices=['acme', 'direct', 'proxied'])
    parser.add_argument('--base-nginx', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    host = hostname(args.host)
    base = args.base_nginx.read_text()
    ranges = official_ranges()
    config = render(base, host, args.mode, ranges)
    args.output.mkdir(parents=True, exist_ok=False, mode=0o700)
    payloads = {
        'nginx.conf': config,
        'cache-rules.json': json.dumps({'phase': 'http_request_cache_settings', 'rules': cache_rules(host)}, ensure_ascii=False, indent=2),
        'dns-direct.json': json.dumps({'type': 'A', 'name': host, 'content': ORIGIN_IP, 'ttl': 300, 'proxied': False}, indent=2),
        'dns-proxied.json': json.dumps({'type': 'A', 'name': host, 'content': ORIGIN_IP, 'ttl': 1, 'proxied': True}, indent=2),
        'settings.json': json.dumps({'ssl': 'strict', 'always_use_https': 'on', 'rocket_loader': 'off'}, indent=2),
    }
    for name, content in payloads.items():
        (args.output / name).write_text(content + '\n')
    manifest = {'host': host, 'mode': args.mode, 'origin_ip': ORIGIN_IP, 'base_path': '',
                'created_at': datetime.now(timezone.utc).isoformat(),
                'created_epoch': datetime.now(timezone.utc).timestamp(), 'ranges': ranges,
                'base_sha256': digest(base),
                'nginx_sha256': digest((args.output / 'nginx.conf').read_text()),
                'reserved_example': reserved_host(host)}
    (args.output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'Rendered {args.mode} bundle in {args.output}. No live changes made.')


if __name__ == '__main__':
    main()
