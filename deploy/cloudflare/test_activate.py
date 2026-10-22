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
    def fixture(self, root, host='bbs.melon-qa.net'):
        files = {'nginx.conf': root/'nginx.conf', 'compose.yml': root/'compose.yml', '.env': root/'.env'}
        for name, contents in {'nginx.conf':'original nginx', 'compose.yml':'MELON_PUBLIC_ORIGIN: https://114.215.182.66', '.env':'MELON_IMAGE=test\n'}.items():
            files[name].write_text(contents)
        bundle=root/'bundle';bundle.mkdir();(bundle/'nginx.conf').write_text('candidate nginx')
        meta={'host':host,'mode':'acme','created_epoch':time.time(),'ranges':['173.245.48.0/20'],
              'base_sha256':digest('original nginx'),'nginx_sha256':digest('candidate nginx')}
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
