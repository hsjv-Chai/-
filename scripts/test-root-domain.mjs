// Run against a disposable root-path server with MELON_PUBLIC_ORIGIN=https://gua4u.cn.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {join, resolve} from 'node:path';
const base = process.env.MELON_TEST_URL;
const directory = resolve(process.env.MELON_DATA_DIR || '');
if (!base || !['127.0.0.1','localhost'].includes(new URL(base).hostname) || new URL(base).pathname !== '/' || !directory.includes('root-domain-qa')) {
  throw Error('Requires a root-path loopback server and isolated root-domain-qa directory');
}
const origin = 'https://gua4u.cn';
const db = new DatabaseSync(join(directory, 'melon.sqlite'));
const username = 'root_' + Date.now();
let cookie = '', userId, checks = 0;
function check(value, label) {assert.ok(value, label); checks++;}
async function api(path, method='GET', body, expected=200, source=origin) {
  const r=await fetch(base+'/api/'+path,{method, headers:{Origin:source,'Content-Type':'application/json',Cookie:cookie}, body:body===undefined?undefined:JSON.stringify(body)});
  const data=await r.json();assert.equal(r.status,expected,JSON.stringify(data));checks++;
  check(r.headers.get('cache-control')==='no-store','API must not cache');
  return {r,data};
}
try {
  for(const path of ['/','/games','/garden','/games/00000000-0000-4000-8000-000000000000']) {
    const r=await fetch(base+path);check(r.status===200,'root route '+path);
    const html=await r.text();
    check(!html.includes('/melon/'),'no legacy asset or navigation prefix');
    check(html.includes('/_next/static/'),'root assets');
    const assets=[...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"?]+\.(?:js|css)[^"]*)"/g)].map(x=>x[1]);
    check(assets.length>0,'built assets exist');
    if(path==='/') {
      for(const asset of new Set(assets)) {const a=await fetch(base+asset);check(a.status===200,'asset '+asset);}
      const filing=process.env.MELON_TEST_ICP_NUMBER;
      check(filing?html.includes(filing)&&html.includes('https://beian.miit.gov.cn/'):!html.includes('class="filing-footer"'),'runtime filing footer');
    }
  }
  await api('auth/register','POST',{username,nickname:'域名隔离测试',password:'Root_Domain_Qa_2026'},403,'https://114.215.182.66');
  const {r}=await api('auth/register','POST',{username,nickname:'域名隔离测试',password:'Root_Domain_Qa_2026'});
  const raw=r.headers.get('set-cookie')||'';
  check(/(?:^|;\s*)Path=\/(?:;|$)/.test(raw),'cookie root scope');
  check(raw.includes('Secure')&&raw.includes('HttpOnly')&&raw.includes('SameSite=Lax'),'cookie protections');
  cookie=raw.split(';')[0];
  userId=(await api('auth/me')).data.user.id;
  await api('garden/check-in','POST',{});
  await api('garden/check-in','POST',{},403,'https://114.215.182.66');
  await api('garden/check-in','POST',{},403,'https://gua4u.cn.evil.example');
  await api('does-not-exist','GET',undefined,404);
  const logout=await api('auth/logout','POST');
  check(/(?:^|;\s*)Path=\/(?:;|$)/.test(logout.r.headers.get('set-cookie')||''),'logout clears root cookie');
  await api('garden','GET',undefined,401);
  console.log(`PASS: ${checks} root-domain assertions; root assets/routes, runtime footer, Secure root cookie, origin isolation and no-store APIs.`);
} finally {
  if(userId) {
    db.prepare('DELETE FROM garden_check_ins WHERE user_id=?').run(userId);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
    db.prepare('DELETE FROM users WHERE id=?').run(userId);
  }
  db.prepare('DELETE FROM auth_attempts WHERE key=?').run(username);
  db.close();
}
