import json
import subprocess
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch
import activate
from render import digest


class ActivationTests(unittest.TestCase):
    def test_root_activation_and_failure_restore_whole_configuration(self):
        for fail_health in (False, True):
            with self.subTest(fail_health=fail_health), tempfile.TemporaryDirectory() as tmp:
                root=Path(tmp);files,bundle=self.fixture(root)
                files['compose.yml'].write_text((Path(__file__).parent.parent/'compose.yml').read_text())
                originals={name:path.read_text() for name,path in files.items()}
                inode=files['nginx.conf'].stat().st_ino
                meta=json.loads((bundle/'manifest.json').read_text());meta['mode']='direct'
                (bundle/'manifest.json').write_text(json.dumps(meta))
                certs=root/'certs';cert=(certs/meta['host']);cert.mkdir(parents=True)
                for name in ('fullchain.pem','privkey.pem'):(cert/name).touch()
                calls=[]
                with patch.multiple(activate,ROOT=root,NGINX=files['nginx.conf'],FILES=files,CERTIFICATES=certs), \
                     patch.object(activate.os,'geteuid',return_value=0), \
                     patch.object(activate,'load_readiness',return_value={'icp_number':'浙ICP备12345678号'}), \
                     patch.object(activate,'check_image'),patch.object(activate,'ensure_idle') as idle, \
                     patch.object(activate,'official_ranges',return_value=meta['ranges']), \
                     patch.object(activate,'run',side_effect=lambda *args:calls.append(args)), \
                     patch.object(activate.subprocess,'run',return_value=subprocess.CompletedProcess([],1 if fail_health else 0)) as curl, \
                     patch.object(activate.time,'sleep'), \
                     patch('sys.argv',['activate.py','--bundle',str(bundle),'--image','melon-community:root-qa']):
                    if fail_health:
                        with self.assertRaisesRegex(RuntimeError,'health check'):activate.main()
                    else:activate.main()
                    idle.assert_called_once()
                    self.assertTrue(all('/api/health' in c.args[0][-1] and '/melon/' not in c.args[0][-1] for c in curl.call_args_list))
                self.assertEqual(files['nginx.conf'].stat().st_ino,inode)
                if fail_health:
                    self.assertEqual({n:p.read_text() for n,p in files.items()},originals)
                else:
                    env=files['.env'].read_text()
                    self.assertIn('MELON_IMAGE=melon-community:root-qa\n',env)
                    self.assertIn('MELON_BASE_PATH=\n',env)
                    self.assertIn('MELON_PUBLIC_ORIGIN=https://'+meta['host'],env)
                    self.assertIn('MELON_ICP_NUMBER=浙ICP备12345678号',env)
                self.assertEqual(files['.env'].stat().st_mode & 0o777,0o600)
                self.assertTrue(all('sqlite' not in ' '.join(c) for c in calls))

    def test_pending_filing_and_active_games_prevent_writes(self):
        for blocked_by in ('filing','games'):
            with self.subTest(blocked_by=blocked_by), tempfile.TemporaryDirectory() as tmp:
                root=Path(tmp);files,bundle=self.fixture(root)
                originals={name:path.read_text() for name,path in files.items()}
                with patch.multiple(activate,ROOT=root,NGINX=files['nginx.conf'],FILES=files), \
                     patch.object(activate.os,'geteuid',return_value=0), \
                     patch.object(activate,'load_readiness',side_effect=ValueError('Pending filing') if blocked_by=='filing' else None,return_value={}), \
                     patch.object(activate,'official_ranges',return_value=['173.245.48.0/20']), \
                     patch.object(activate,'ensure_idle',side_effect=subprocess.CalledProcessError(3,['active-games'])), \
                     patch.object(activate,'run') as run, \
                     patch('sys.argv',['activate.py','--bundle',str(bundle)]):
                    with self.assertRaises((SystemExit,subprocess.CalledProcessError)):activate.main()
                    run.assert_not_called()
                self.assertEqual({n:p.read_text() for n,p in files.items()},originals)
                self.assertFalse((root/'backups').exists())

    def fixture(self, root, host='bbs.melon-qa.net'):
        files = {'nginx.conf': root/'nginx.conf', 'compose.yml': root/'compose.yml', '.env': root/'.env'}
        for name, contents in {'nginx.conf':'original nginx', 'compose.yml':'MELON_PUBLIC_ORIGIN: https://114.215.182.66', '.env':'MELON_IMAGE=test\n'}.items():
            files[name].write_text(contents)
        bundle=root/'bundle';bundle.mkdir();(bundle/'nginx.conf').write_text('candidate nginx')
        meta={'host':host,'mode':'acme','created_epoch':time.time(),'ranges':['173.245.48.0/20'],
              'base_path':'','base_sha256':digest('original nginx'),'nginx_sha256':digest('candidate nginx')}
        (bundle/'manifest.json').write_text(json.dumps(meta))
        return files,bundle

    def test_nginx_failure_restores_exact_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);files,bundle=self.fixture(root);calls=[]
            def run(*args):
                calls.append(args)
                if args[-1]=='-t' and sum(c[-1]=='-t' for c in calls)==1:
                    raise subprocess.CalledProcessError(1,args)
            with patch.multiple(activate,ROOT=root,NGINX=files['nginx.conf'],FILES=files), \
                 patch.object(activate.os,'geteuid',return_value=0), \
                 patch.object(activate,'load_readiness',return_value={}), \
                 patch.object(activate,'official_ranges',return_value=['173.245.48.0/20']), \
                 patch.object(activate,'run',side_effect=run), \
                 patch('sys.argv',['activate.py','--bundle',str(bundle)]):
                with self.assertRaises(subprocess.CalledProcessError):activate.main()
            self.assertEqual(files['nginx.conf'].read_text(),'original nginx')
            self.assertEqual(files['.env'].read_text(),'MELON_IMAGE=test\n')
            self.assertIn(('docker','exec','moye-nginx-1','nginx','-s','reload'),calls)

    def test_example_domain_never_runs_mutations(self):
        with tempfile.TemporaryDirectory() as tmp:
            files,bundle=self.fixture(Path(tmp),'bbs.example.com')
            with patch.object(activate.os,'geteuid',return_value=0),patch.object(activate,'run') as run, \
                 patch('sys.argv',['activate.py','--bundle',str(bundle)]):
                with self.assertRaises(SystemExit):activate.main()
                run.assert_not_called()


if __name__=='__main__':unittest.main()
