#!/bin/sh
# Run from this folder on a Docker host. No host ports or production data are mounted.
set -eu
task_root=$(mktemp -d /tmp/melon-proxy-test.XXXXXX)
test_id="melon-cf-qa-$(date +%s)-$$"
cleanup() {
  docker rm -f "$test_id-nginx" "$test_id-app" "$test_id-trusted" "$test_id-untrusted" >/dev/null 2>&1 || true
  docker network rm "$test_id" >/dev/null 2>&1 || true
  rm -rf "$task_root"
}
trap cleanup EXIT HUP INT TERM
docker network create "$test_id" >/dev/null
mkdir -p "$task_root/certs/live/example.com" "$task_root/certs/live/114.215.182.66"
mkdir -p "$task_root/acme/.well-known/acme-challenge"
printf 'acme-proof\n' > "$task_root/acme/.well-known/acme-challenge/qa"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=example.com \
  -keyout "$task_root/certs/live/example.com/privkey.pem" \
  -out "$task_root/certs/live/example.com/fullchain.pem" >/dev/null 2>&1
cp "$task_root/certs/live/example.com/privkey.pem" "$task_root/certs/live/114.215.182.66/privkey.pem"
cp "$task_root/certs/live/example.com/fullchain.pem" "$task_root/certs/live/114.215.182.66/fullchain.pem"
cp test-proxy.mjs "$task_root/"
cat > "$task_root/upstream.mjs" <<'JS'
import http from 'node:http';
http.createServer((req,res)=>{
  res.setHeader('Cache-Control','public, max-age=3600');
  if(req.url==='/'&&req.headers.host==='114.215.182.66'){res.end('moye-ok');return;}
  if(req.url.includes('missing.js')){res.statusCode=404;res.end('not found');return;}
  if(req.url.includes('_next/static')){res.end('console.log("fixture")');return;}
  if(req.method==='POST')res.statusCode=400;
  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify({ok:true,client:req.headers['x-forwarded-for'],cookie:req.headers.cookie||null}));
}).listen(3000,'0.0.0.0');
JS
docker run -d --name "$test_id-app" --network "$test_id" --network-alias melon-app --network-alias app --network-alias moye-app-1 \
  --memory 128m -v "$task_root:/qa:ro" node:24-alpine node /qa/upstream.mjs >/dev/null
for kind in trusted untrusted; do
  docker run -d --name "$test_id-$kind" --network "$test_id" --memory 128m \
    -v "$task_root:/qa:ro" node:24-alpine node -e 'setInterval(()=>{},1000)' >/dev/null
done
trusted_ip=$(docker inspect "$test_id-trusted" --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
# Test the exact existing layout, replacing only its managed forum block.
cp /opt/moye/deploy/nginx.conf "$task_root/base.conf"
python3 - "$task_root" "$trusted_ip" direct <<'PY'
import sys
from pathlib import Path
from render import render
p=Path(sys.argv[1]); (p/'nginx.conf').write_text(render((p/'base.conf').read_text(),'example.com',sys.argv[3],[sys.argv[2]+'/32']))
PY
docker run -d --name "$test_id-nginx" --network "$test_id" --network-alias nginx --memory 128m \
  -v "$task_root/nginx.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v "$task_root/acme:/var/www/acme:ro" \
  -v "$task_root/certs:/etc/letsencrypt:ro" nginx:1.28-alpine >/dev/null
docker exec "$test_id-nginx" nginx -t
docker exec "$test_id-trusted" node /qa/test-proxy.mjs direct yes
docker exec "$test_id-untrusted" node /qa/test-proxy.mjs direct no
python3 - "$task_root" "$trusted_ip" proxied <<'PY'
import sys
from pathlib import Path
from render import render
p=Path(sys.argv[1]); (p/'nginx.conf').write_text(render((p/'base.conf').read_text(),'example.com',sys.argv[3],[sys.argv[2]+'/32']))
PY
docker exec "$test_id-nginx" nginx -t
docker exec "$test_id-nginx" nginx -s reload
docker exec "$test_id-untrusted" node /qa/test-proxy.mjs proxied no
docker exec "$test_id-trusted" node /qa/test-proxy.mjs proxied yes
