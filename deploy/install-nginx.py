"""Add only the forum location to the existing HTTPS virtual host."""
from pathlib import Path
from datetime import datetime, timezone
import subprocess
path = Path('/opt/moye/deploy/nginx.conf')
original = path.read_text()
if '# BEGIN melon-community' in original:
    raise SystemExit('Forum location already exists; inspect before changing it.')
anchor = '  location / {\n    proxy_pass http://app:3000;'
if original.count(anchor) != 1:
    raise SystemExit('Existing proxy layout changed; refusing to overwrite it.')
snippet = Path('/opt/melon/releases/20261022-v1/deploy/nginx-location.conf').read_text()
backup = Path('/opt/melon/backups') / ('nginx-before-melon-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '.conf')
backup.write_text(original)
backup.chmod(0o600)
# Write in place: the running container bind-mounts this file's inode.
path.write_text(original.replace(anchor, snippet + '\n' + anchor))
try:
    subprocess.run(['docker','exec','moye-nginx-1','nginx','-t'],check=True)
    subprocess.run(['docker','exec','moye-nginx-1','nginx','-s','reload'],check=True)
except BaseException:
    path.write_text(original)
    subprocess.run(['docker','exec','moye-nginx-1','nginx','-t'],check=True)
    subprocess.run(['docker','exec','moye-nginx-1','nginx','-s','reload'],check=True)
    raise
print('Forum route installed. Previous config saved to',backup)
