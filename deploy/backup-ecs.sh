#!/bin/sh
set -eu
cd /opt/melon
stamp=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p backups
chmod 700 backups
# Freeze only this application briefly so SQLite and image files form one snapshot.
docker compose pause app
trap 'docker compose unpause app >/dev/null 2>&1 || true' EXIT HUP INT TERM
tar -czf "backups/melon-data-$stamp.tar.gz" data
chmod 600 "backups/melon-data-$stamp.tar.gz"
docker compose unpause app
trap - EXIT HUP INT TERM
printf 'Saved /opt/melon/backups/melon-data-%s.tar.gz\n' "$stamp"
