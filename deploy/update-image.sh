#!/bin/sh
# Run as root on the ECS host after testing an additive, backward-compatible migration.
set -eu
image=${1:?Usage: update-image.sh melon-community:VERSION}
case "$image" in melon-community:*) ;; *) echo 'Unexpected image name' >&2; exit 1;; esac
case "$image" in *[!a-zA-Z0-9:._-]*) echo 'Invalid image name' >&2; exit 1;; esac
[ "$(id -u)" = 0 ] || { echo 'Run as root' >&2; exit 1; }
docker image inspect "$image" --format '{{.Id}}'
# Path migrations must switch Compose, origin and Nginx together via activate.py.
current_base=$(docker exec melon-app-1 node -p "process.env.NEXT_PUBLIC_BASE_PATH||''")
image_base=$(docker image inspect "$image" --format '{{json .Config.Env}}' | python3 -c 'import json,sys; print(next((v.split("=",1)[1] for v in json.load(sys.stdin) if v.startswith("NEXT_PUBLIC_BASE_PATH=")), ""))')
[ "$current_base" = "$image_base" ] || { echo 'Image path differs; use the domain activation/restore workflow.' >&2; exit 1; }
cd /opt/melon
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup="backups/env-before-${stamp}"
umask 077
mkdir -p backups
cp .env "$backup"
sh /opt/melon/backup-ecs.sh
rollback() {
  echo 'Activation failed; restoring previous image configuration' >&2
  cp "$backup" .env
  docker compose up -d --no-deps app
}
trap 'status=$?; if [ "$status" -ne 0 ]; then rollback; fi' EXIT
trap 'exit 1' HUP INT TERM
python3 - "$image" <<'PY'
import re,sys
p='.env'
s=open(p).read()
if re.search(r'^MELON_IMAGE=',s,re.M):
    s=re.sub(r'^MELON_IMAGE=.*$',lambda _: 'MELON_IMAGE='+sys.argv[1],s,flags=re.M)
else:
    s+='\nMELON_IMAGE='+sys.argv[1]+'\n'
with open(p,'w') as f: f.write(s)
PY
docker compose up -d --no-deps app
attempt=0
while [ "$attempt" -lt 30 ]; do
  if curl --noproxy '*' -fsS "http://127.0.0.1:3100${current_base}/api/health" >/dev/null && [ "$(docker inspect melon-app-1 --format '{{.State.Health.Status}}')" = healthy ]; then
    trap - EXIT HUP INT TERM
    echo "Activated $image; previous environment retained at /opt/melon/$backup"
    exit 0
  fi
  attempt=$((attempt+1))
  sleep 2
done
exit 1
