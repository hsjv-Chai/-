"""Private, explicit release prerequisites. Never infer approval from DNS state."""
import argparse
import json
import re
from pathlib import Path


def load_readiness(path, host):
    if not path:
        raise ValueError('Supply the private readiness file after ICP approval and Aliyun access confirmation.')
    path = Path(path)
    if path.stat().st_mode & 0o077:
        raise ValueError('Readiness file must be private (chmod 600).')
    value = json.loads(path.read_text())
    if value.get('host') != host:
        raise ValueError('Readiness hostname does not match this deployment.')
    if value.get('icp_approved') is not True or value.get('aliyun_access_confirmed') is not True:
        raise ValueError('ICP approval and Aliyun access are still pending; no live changes permitted.')
    if not re.fullmatch(r'[\u4e00-\u9fff]ICP备[0-9]{6,16}号(?:-[0-9]+)?', value.get('icp_number', '')):
        raise ValueError('Supply the real approved ICP filing number.')
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', value.get('certificate_email', '')):
        raise ValueError('Supply a certificate contact email in the private readiness file.')
    return value


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--file', required=True)
    p.add_argument('--host', required=True)
    p.add_argument('--email', action='store_true')
    args = p.parse_args()
    try:
        value = load_readiness(args.file, args.host)
    except (ValueError, OSError) as error:
        p.error(str(error))
    if args.email:
        print(value['certificate_email'])
    else:
        print('Release prerequisites confirmed for', args.host)
