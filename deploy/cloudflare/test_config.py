import unittest
from render import cache_rules, hostname, render, reserved_host
from configure import merge_rules, host_in_zone

BASE = '''server {
  listen 443 ssl;
  server_name 114.215.182.66;
  # BEGIN melon-community
  location ~ ^/melon(?:/|$) { proxy_pass http://melon-app:3000; }
  # END melon-community
  location / { proxy_pass http://app:3000; }
}
'''


class ConfigurationTests(unittest.TestCase):
    def test_host_injection_and_examples(self):
        for value in ('x; return 200;', 'https://bbs.test.com', '../etc/passwd', 'bbs.test.com:443', '*.test.com'):
            with self.assertRaises(ValueError):
                hostname(value)
        self.assertTrue(reserved_host('bbs.example.com'))
        self.assertEqual(hostname('BBS.Valid-domain.COM'), 'bbs.valid-domain.com')

    def test_apex_and_zone_boundaries(self):
        self.assertTrue(host_in_zone('gua4u.cn', 'gua4u.cn'))
        self.assertTrue(host_in_zone('bbs.gua4u.cn', 'gua4u.cn'))
        for host in ('evilgua4u.cn', 'gua4u.cn.evil.net', 'other.cn'):
            self.assertFalse(host_in_zone(host, 'gua4u.cn'))
        config = render(BASE, 'gua4u.cn', 'direct', ['173.245.48.0/20'])
        self.assertIn('server_name gua4u.cn;', config)
        self.assertIn('return 302 https://gua4u.cn$melon_legacy_target;', config)
        self.assertNotIn('return 302 /melon/', config)
        self.assertIn('~^POST:/api/auth/', config)
        self.assertIn('~^/_next/static/', config)
        self.assertIn('"/_next/static/"', cache_rules('gua4u.cn')[0]['expression'])
        self.assertNotIn('/melon/_next/', str(cache_rules('gua4u.cn')))

    def test_missing_and_duplicate_marker_refused(self):
        for text in ('server {}', BASE + BASE):
            with self.assertRaises(ValueError):
                render(text, 'bbs.example.com', 'direct', ['173.245.48.0/20'])

    def test_stage_isolation_and_preserved_moye(self):
        acme = render(BASE, 'bbs.example.com', 'acme', ['173.245.48.0/20'])
        self.assertIn(BASE.rstrip(), acme)
        self.assertNotIn('real_ip_header', acme)
        direct = render(acme, 'bbs.example.com', 'direct', ['173.245.48.0/20'])
        proxied = render(direct, 'bbs.example.com', 'proxied', ['173.245.48.0/20'])
        self.assertIn('location / { proxy_pass http://app:3000; }', proxied)
        self.assertNotIn('if ($melon_cf_peer = 0)', direct)
        self.assertIn('geo $realip_remote_addr $melon_cf_peer', proxied)
        self.assertIn('if ($melon_cf_peer = 0)', proxied)
        self.assertEqual(proxied.count('# BEGIN melon-cloudflare'), 1)
        self.assertEqual(render(proxied, 'bbs.example.com', 'proxied', ['173.245.48.0/20']), proxied)

    def test_safe_cache_merge_preserves_other_sites(self):
        other = {'id': 'existing', 'ref': 'other', 'expression': 'http.host eq "other.example.com"',
                 'action': 'set_cache_settings', 'action_parameters': {'cache': False}, 'enabled': True, 'version': '4'}
        desired = cache_rules('bbs.example.com')
        merged = merge_rules([other], desired)
        self.assertEqual(merged[0]['id'], 'existing')
        self.assertEqual(merged[1:], desired)
        self.assertEqual(merge_rules(merged, desired), merged)
        self.assertNotIn('origin_cache_control', desired[0]['action_parameters'])
        with self.assertRaises(ValueError):
            merge_rules(cache_rules('different.example.com'), desired)
        with self.assertRaises(ValueError):
            merge_rules([dict(other, ref=str(i)) for i in range(9)], desired)


if __name__ == '__main__':
    unittest.main()
