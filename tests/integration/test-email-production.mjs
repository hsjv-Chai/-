// Run only against a production build deliberately configured with preview mail.
// The expected refusal happens before the provider can make any external request.
import assert from 'node:assert/strict';
import {randomUUID,pbkdf2Sync} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {resolve,join} from 'node:path';

const base=process.env.MELON_TEST_URL;
const directory=resolve(process.env.MELON_DATA_DIR||'');
assert.ok(base && ['127.0.0.1','localhost'].includes(new URL(base).hostname));
assert.ok(directory.includes('email-production-qa'));
assert.equal(process.env.MELON_MAIL_PROVIDER,'preview');
const origin=process.env.MELON_TEST_ORIGIN||'https://example.com';
const db=new DatabaseSync(join(directory,'melon.sqlite'));
const userId=randomUUID(),username='legacy_'+Date.now(),signupUsername='new_'+Date.now(),password='Legacy_Email_Qa_12345',salt=randomUUID();
let checks=0;
function check(value,message){assert.ok(value,message);checks++;}
async function request(path,method='GET',body,cookie='',status=200){
  const response=await fetch(base+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json();
  assert.equal(response.status,status,JSON.stringify(data));checks++;
  check(response.headers.get('cache-control')==='no-store','response never cached');
  return {response,data};
}
try{
  db.prepare('INSERT INTO users(id,username,nickname,password,role,created_at) VALUES(?,?,?,?,?,?)').run(userId,username,'历史账号验证',salt+':'+pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex'),'member',Date.now());
  const signup={username:signupUsername,email:'unconfigured@example.test',nickname:'禁止降级验证',password};
  await request('auth/email-code','POST',signup,'',503);
  await request('auth/register','POST',signup,'',400);
  await request('auth/register','POST',{...signup,challengeId:randomUUID(),code:'123456'},'',503);
  check(!db.prepare('SELECT id FROM users WHERE username=?').get(signup.username),'no unverified account created');
  check(db.prepare('SELECT COUNT(*) n FROM email_send_attempts').get().n===0,'configuration refusal never calls mail provider');
  check(db.prepare('SELECT COUNT(*) n FROM email_challenges').get().n===0,'no challenge created');
  check(db.prepare('SELECT COUNT(*) n FROM email_quotas').get().n===0,'no quota consumed');
  const login=await request('auth/login','POST',{username,password});
  const raw=login.response.headers.get('set-cookie');
  check(raw.includes('Secure')&&raw.includes('HttpOnly')&&raw.includes('SameSite=Lax'),'legacy cookie protections retained');
  const cookie=raw.split(';')[0];
  const me=(await request('auth/me','GET',undefined,cookie)).data.user;
  check(me.id===userId&&me.email===null&&me.email_verified_at===null,'legacy login works without bound email');
  const profile=(await request('users/'+userId)).data.user;
  check(!Object.hasOwn(profile,'email')&&!Object.hasOwn(profile,'email_canonical'),'public profile excludes email');
  await request('auth/logout','POST',undefined,cookie);
  console.log(`PASS: ${checks} production refusal/legacy checks; preview mail rejected, signup cannot downgrade, legacy login and privacy preserved.`);
}finally{
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
  db.prepare('DELETE FROM users WHERE id=?').run(userId);
  db.prepare('DELETE FROM auth_attempts WHERE key=? OR key=?').run(username,signupUsername);
  db.close();
}
