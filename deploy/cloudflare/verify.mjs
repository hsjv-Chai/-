#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';

export function summarize(samples) {
  const successful=samples.filter(s=>s.status===200&&Number.isFinite(s.ms));
  const times=successful.map(s=>s.ms).sort((a,b)=>a-b);
  return {count:samples.length,successRate:samples.length?successful.length/samples.length:0,
    p95:times.length?times[Math.ceil(times.length*.95)-1]:null};
}

export function compareReports(reports) {
  const groups=new Map();
  for(const r of reports){
    assert.ok(['direct','proxied'].includes(r.mode)&&r.network&&r.mainlandConfirmed===true,'Network location must be explicitly confirmed');
    const pair=groups.get(r.network)||{};
    assert.ok(!pair[r.mode],'Duplicate network/mode report');
    pair[r.mode]=r;groups.set(r.network,pair);
  }
  assert.ok(groups.size>=2,'Two independently measured mainland networks are required');
  const result=[];
  for(const [network,pair] of groups){
    assert.ok(pair.direct&&pair.proxied,'Both direct and proxied measurements are required');
    assert.equal(pair.direct.host,pair.proxied.host,'Compare the same hostname');
    assert.equal(pair.direct.path,pair.proxied.path,'Compare the same endpoint');
    const direct=summarize(pair.direct.samples),proxied=summarize(pair.proxied.samples);
    const close=Math.abs(Date.parse(pair.direct.startedAt)-Date.parse(pair.proxied.startedAt))<=2*3600000;
    assert.ok(Number.isFinite(Date.parse(pair.direct.startedAt))&&Number.isFinite(Date.parse(pair.proxied.startedAt)));
    const pass=close&&direct.count>=100&&proxied.count>=100&&direct.successRate>=.99&&proxied.successRate>=.99&&direct.p95>0&&proxied.p95!==null&&proxied.p95<=direct.p95*1.3;
    result.push({network,direct,proxied,comparableTimes:close,pass});
  }
  return {pass:result.every(r=>r.pass),networks:result};
}

async function main(){
  const {values:v,positionals:[command,...files]}=parseArgs({allowPositionals:true,options:{
    host:{type:'string'},mode:{type:'string'},network:{type:'string'},output:{type:'string'},
    count:{type:'string',default:'100'},'credential-file':{type:'string'},
    'check-rate-limit':{type:'boolean'},'confirm-mainland':{type:'boolean'},
  }});
  if(command==='compare'){
    const report=compareReports(files.map(file=>JSON.parse(readFileSync(file,'utf8'))));
    console.log(JSON.stringify(report,null,2));if(!report.pass)process.exitCode=1;return;
  }
  assert.match(v.host||'',/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/,'Supply --host without scheme or path');
  assert.ok(['direct','proxied'].includes(v.mode),'Supply --mode direct or proxied');
  const origin=`https://${v.host}`,base=origin+'/melon';
  async function request(path,opts={}){
    return fetch(base+path,{redirect:'manual',signal:AbortSignal.timeout(15000),...opts});
  }
  const health=await request('/api/health');assert.equal(health.status,200);
  assert.equal(Boolean(health.headers.get('cf-ray')),v.mode==='proxied','Observed routing does not match requested mode');
  if(command==='sample'){
    assert.ok(v.network&&v.output&&v['confirm-mainland'],'Supply network label, output and confirm actual mainland test location');
    const count=Number(v.count);assert.ok(Number.isInteger(count)&&count>=100&&count<=1000);
    const report={host:v.host,mode:v.mode,network:v.network,mainlandConfirmed:true,path:'/api/posts?page=1',startedAt:new Date().toISOString(),samples:[]};
    for(let i=0;i<count;i++){
      const start=performance.now();
      try{
        const r=await request(report.path);await r.arrayBuffer();
        report.samples.push({status:r.status,ms:performance.now()-start,ray:r.headers.get('cf-ray')});
        assert.equal(Boolean(r.headers.get('cf-ray')),v.mode==='proxied','Route changed during measurement');
      }catch(e){if(e.code==='ERR_ASSERTION')throw e;report.samples.push({status:0,ms:performance.now()-start,error:e.name});}
      await new Promise(resolve=>setTimeout(resolve,200));
    }
    writeFileSync(v.output,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
    console.log(JSON.stringify(summarize(report.samples),null,2));return;
  }
  assert.equal(command,'smoke','Use smoke, sample or compare');
  let checks=0;
  const check=(condition,message)=>{assert.ok(condition,message);checks++;};
  for(const path of ['/api/health','/api/auth/me','/api/posts','/api/uploads/nonexistent','/_next/static/qa-missing.js']){
    const r=await request(path);
    check(r.headers.get('cache-control')?.includes('no-store'),`${path} no-store`);
    check(!['HIT','STALE','UPDATING','REVALIDATED'].includes(r.headers.get('cf-cache-status')),`${path} not edge-cached`);
    await r.arrayBuffer();
  }
  const html=await (await request('')).text();
  const asset=[...html.matchAll(/(?:src|href)="([^" ]+\.(?:js|css)(?:\?[^" ]*)?)"/g)].map(m=>m[1]).find(p=>p.startsWith('/melon/_next/static/'));
  check(Boolean(asset),'versioned asset discovered');
  let hit=false;
  for(let i=0;i<3;i++){
    const r=await fetch(origin+asset,{signal:AbortSignal.timeout(15000)});
    check(r.ok&&r.headers.get('cache-control')?.includes('immutable'),'static served with immutable cache');
    hit ||= r.headers.get('cf-cache-status')==='HIT';await r.arrayBuffer();
  }
  if(v.mode==='proxied'){
    check(hit,'static asset reached Cloudflare HIT');
    const status=execFileSync('curl',['-sS','--max-time','15','--resolve',`${v.host}:443:114.215.182.66`,
      '-H','CF-Connecting-IP: 173.245.48.1','-o','/dev/null','-w','%{http_code}',base+'/api/health'],{encoding:'utf8'});
    check(status==='403','origin blocks direct requests, including forged forwarding headers');
  }
  const old=await fetch('https://114.215.182.66/melon/post/qa?q=1',{redirect:'manual',signal:AbortSignal.timeout(15000)});
  check(old.status===302&&old.headers.get('location')===base+'/post/qa?q=1','old URL redirect preserves path and query');
  const refused=await fetch('https://114.215.182.66/melon/api/posts',{method:'POST',signal:AbortSignal.timeout(15000)});
  check(refused.status===410,'old writes rejected');
  if(v['credential-file']){
    const contents=readFileSync(v['credential-file'],'utf8');
    const username=contents.match(/用户名：(.+)/)?.[1].trim(),password=contents.match(/密码：(.+)/)?.[1].trim();
    assert.ok(username&&password,'Invalid private credential file');
    const login=await request('/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username,password})});
    assert.equal(login.status,200,'Administrator login');
    const raw=login.headers.get('set-cookie')||'',cookie=raw.split(';')[0];
    try{
      check(raw.includes('HttpOnly')&&raw.includes('Secure')&&raw.includes('Path=/melon'),'secure session cookie');
      const me=await request('/api/auth/me',{headers:{Cookie:cookie}});check((await me.json()).user?.role==='admin','admin role retained');
      const guest=await request('/api/admin');check(guest.status===401,'guest admin request refused');
    }finally{
      const logout=await request('/api/auth/logout',{method:'POST',headers:{Cookie:cookie,Origin:origin}});assert.equal(logout.status,200);
    }
  }
  if(v['check-rate-limit']){
    // Invalid username fails validation before inserting any auth_attempts row.
    const responses=await Promise.all(Array.from({length:20},()=>request('/api/auth/login',{
      method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'###',password:'qa-only-invalid-user'})})));
    const limited=responses.find(r=>r.status===429);
    check(limited&&(await limited.json()).error&&limited.headers.get('retry-after')==='60','JSON rate limit response');
  }
  console.log(`PASS: ${checks} public ${v.mode} checks. This is not the two-account functional or mainland performance acceptance.`);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
