import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const base=process.env.MELON_VERIFY_URL||'https://114.215.182.66/melon';
const credential=readFileSync(process.env.MELON_CREDENTIAL_FILE,'utf8');
const username=credential.match(/用户名：(.+)/)[1].trim(),password=credential.match(/密码：(.+)/)[1].trim();
let cookie='';
async function call(path,method='GET',body){const response=await fetch(base+'/api/'+path,{method,headers:{Origin:new URL(base).origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});const data=await response.json();assert.equal(response.status,200,`${path}: ${JSON.stringify(data)}`);if(response.headers.has('set-cookie')){const raw=response.headers.get('set-cookie');assert.ok(raw.includes('HttpOnly')&&raw.includes('Secure')&&new RegExp('(?:^|;\\s*)Path='+(new URL(base).pathname.replace(/\/$/,'')||'/')+'(?:;|$)').test(raw));cookie=raw.split(';')[0];}return data;}
assert.equal((await call('health')).ok,true);
const categories=await call('categories');assert.equal(categories.length,4);
const stats=await call('stats');assert.equal(stats.posts,0);assert.equal(stats.replies,0);assert.equal(stats.users,1);
await call('auth/login','POST',{username,password});
const me=await call('auth/me');assert.equal(me.user.role,'admin');assert.equal(me.user.username,username);
const admin=await call('admin');assert.equal(admin.posts.length,0);assert.equal(admin.replies.length,0);
await call('auth/logout','POST');assert.equal((await call('auth/me')).user,null);
console.log('PASS: HTTPS health, four categories, empty site, administrator login, secure cookie, admin access and logout.');
