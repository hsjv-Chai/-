#!/bin/sh
# Run as root on the ECS host after testing an additive, backward-compatible migration.
set -eu
image=${1:?Usage: update-image.sh melon-community:VERSION}
case "$image" in melon-community:*) ;; *) echo 'Unexpected image name' >&2; exit 1;; esac
case "$image" in *[!a-zA-Z0-9:._-]*) echo 'Invalid image name' >&2; exit 1;; esac
[ "$(id -u)" = 0 ] || { echo 'Run as root' >&2; exit 1; }
docker image inspect "$image" --format '{{.Id}}'
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
  if curl -fsS http://127.0.0.1:3100/melon/api/health >/dev/null && [ "$(docker inspect melon-app-1 --format '{{.State.Health.Status}}')" = healthy ]; then
    trap - EXIT HUP INT TERM
    echo "Activated $image; previous environment retained at /opt/melon/$backup"
    exit 0
  fi
  attempt=$((attempt+1))
  sleep 2
done
exit 1
