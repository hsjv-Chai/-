// Uses only a disposable Docker network and test certificates. Never target production.
import https from 'node:https';
import assert from 'node:assert/strict';
const [mode, trusted] = process.argv.slice(2);
function get(path, {host='example.com', method='GET', ip, cookie}={}) {
  return new Promise((resolve,reject)=>{
    const req=https.request({hostname:'nginx',port:443,path,method,servername:host==='114.215.182.66'?'':host,
      rejectUnauthorized:false,headers:{host,...(ip?{'CF-Connecting-IP':ip}:{}),...(cookie?{Cookie:cookie}:{})}},r=>{
      let body='';r.on('data',b=>body+=b);r.on('end',()=>resolve({status:r.statusCode,headers:r.headers,body}));
    });req.on('error',reject);req.end();
  });
}
let count=0;
function check(value, message) {assert.ok(value,message);count++;}
if(mode==='proxied'&&trusted==='no'){
  for(let retry=0;retry<30;retry++){
    const r=await get('/api/health',{ip:'173.245.48.1'});
    if(r.status===403){check(true,'untrusted peer blocked even with forged Cloudflare header');break;}
    if(retry===29)throw Error('Untrusted peer was not blocked');
    await new Promise(r=>setTimeout(r,100));
  }
}else{
  const lookalike=await get('/melonade');check(lookalike.status===200,'unrelated prefix not redirected');
  const ip='203.0.113.42';
  const health=await get('/api/health',{ip});
  check(health.status===200,'health');
  const forwarded=JSON.parse(health.body).client;
  check(trusted==='yes'?forwarded===ip:forwarded!==ip,'only trusted peers can supply client IP');
  const challenge=await get('/.well-known/acme-challenge/qa');
  check(challenge.status===200&&challenge.body.trim()==='acme-proof','HTTPS ACME challenge remains reachable');
  const js=await get('/_next/static/app.js');
  check(js.status===200&&js.headers['cache-control'].includes('immutable'),'static cache');
  const absent=await get('/_next/static/missing.js');
  check(absent.status===404&&absent.headers['cache-control'].includes('no-store'),'static error not cached');
  for(const path of ['/','/games','/garden','/api/posts','/api/garden','/api/games','/api/uploads/test']){
    const r=await get(path);check(r.headers['cache-control'].includes('no-store'),path+' private');
  }
  const a=await get('/api/auth/me',{cookie:'melon_session=account-a'});
  const b=await get('/api/auth/me',{cookie:'melon_session=account-b'});
  check(a.body!==b.body&&a.headers['cache-control'].includes('no-store'),'sessions remain isolated');
  const burst=await Promise.all(Array.from({length:20},()=>get('/api/auth/login',{method:'POST',ip:'203.0.113.90'})));
  const limited=burst.find(r=>r.status===429);
  check(limited&&JSON.parse(limited.body).error&&limited.headers['retry-after']==='60','JSON rate limit');
  const second=await get('/api/auth/login',{method:'POST',ip:'203.0.113.91'});
  if(trusted==='yes')check(second.status===400,'separate client IP has its own quota');
  const normal=await get('/api/posts');check(normal.status===200,'reading unaffected by auth throttle');
}
// Test redirects on both hosts (the forum vhost is intentionally blocked for untrusted proxy peers).
const hosts=mode==='proxied'&&trusted==='no'?['114.215.182.66']:['114.215.182.66','example.com'];
for(const host of hosts){
  for(const [path,target] of [['/melon','/'],['/melon/','/'],['/melon?q=1','/?q=1'],['/melon/games/abc?x=1&next=%2Fgarden','/games/abc?x=1&next=%2Fgarden'],['/melon/p/a%20b?q=%E7%93%9C','/p/a%20b?q=%E7%93%9C']]){
    for(const method of ['GET','HEAD']){
      const r=await get(path,{host,method});
      check(r.status===302&&r.headers.location==='https://example.com'+target,'legacy path/query preserved: '+path);
      check(r.headers['cache-control'].includes('no-store'),'redirect not cached');
    }
  }
  for(const method of ['POST','PUT','PATCH','DELETE']){
    const r=await get('/melon/api/posts',{host,method});
    check(r.status===410&&JSON.parse(r.body).error,'legacy writes refused');
  }
}
const moye=await get('/',{host:'114.215.182.66'});
check(moye.status===200&&moye.body.includes('moye-ok'),'other website retained');
console.log(`PASS ${mode} trusted=${trusted}: ${count} proxy assertions`);
