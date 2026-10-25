import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import configure
from readiness import load_readiness
from activate import root_compose, replace_env, check_image

class ReadinessTests(unittest.TestCase):
    def test_pending_approval_and_bad_host_or_number_fail_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'readiness.json'
            valid={'host':'example.com','icp_approved':True,'aliyun_access_confirmed':True,
                   'icp_number':'京ICP备12345678号-1','certificate_email':'qa@example.com'}
            for change in ({'icp_approved':False},{'aliyun_access_confirmed':False},{'host':'other.cn'},
                           {'icp_number':''},{'icp_number':'待备案'},{'certificate_email':''}):
                path.write_text(json.dumps(dict(valid,**change)));path.chmod(0o600)
                with self.assertRaises(ValueError):load_readiness(path,'example.com')
            path.write_text(json.dumps(valid))
            self.assertEqual(load_readiness(path,'example.com'),valid)
            path.chmod(0o644)
            with self.assertRaises(ValueError):load_readiness(path,'example.com')

    def test_cf_write_never_starts_without_approval(self):
        with patch('sys.argv',['configure.py','--host','gua4u.cn','--zone','test','--action','dns-direct','--snapshot-dir','unused','--apply']), \
             patch.object(configure.subprocess,'run') as run:
            with self.assertRaises(SystemExit):configure.main()
            run.assert_not_called()

    def test_compose_old_and_new_are_both_root_ready_without_changing_other_services(self):
        current=(Path(__file__).resolve().parents[1]/'compose.yml').read_text()
        old=current.replace('${MELON_BASE_PATH-/melon}','/melon').replace('      MELON_ICP_NUMBER: ${MELON_ICP_NUMBER-}\n','').replace("fetch('http://127.0.0.1:3000'+(process.env.NEXT_PUBLIC_BASE_PATH||'')+'/api/health')","fetch('http://127.0.0.1:3000/melon/api/health')")
        self.assertEqual(root_compose(old),current)
        self.assertEqual(root_compose(current),current)
        with self.assertRaises(ValueError):root_compose('unknown custom compose')

    def test_origin_image_path_and_filing_change_as_one_environment(self):
        original='MELON_IMAGE=old\nMELON_BASE_PATH=/melon\nOTHER_VALUE=retained\n'
        updated=replace_env(original,{'MELON_IMAGE':'new','MELON_BASE_PATH':'','MELON_ICP_NUMBER':'京ICP备12345678号-1'})
        self.assertIn('MELON_BASE_PATH=\n',updated)
        self.assertIn('OTHER_VALUE=retained\n',updated)
        self.assertNotIn('/melon',updated)
        self.assertEqual(replace_env(updated,{'MELON_IMAGE':'new'}),updated)
        with self.assertRaises(ValueError):replace_env(original+'MELON_IMAGE=duplicate\n',{'MELON_IMAGE':'new'})

    def test_wrong_path_image_rejected_before_activation(self):
        for config in ({'Env':['NEXT_PUBLIC_BASE_PATH=/melon'],'Labels':{}},
                       {'Env':['NEXT_PUBLIC_BASE_PATH=/melon'],'Labels':{'io.melon.base-path':''}}):
            with patch('activate.subprocess.check_output',return_value=json.dumps(config)):
                with self.assertRaises(ValueError):check_image('melon-community:qa')
        with patch('activate.subprocess.check_output',return_value=json.dumps({'Env':['NEXT_PUBLIC_BASE_PATH='],'Labels':{'io.melon.base-path':''}})):
            check_image('melon-community:qa')

if __name__=='__main__':unittest.main()
