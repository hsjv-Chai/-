import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarize,compareReports} from './verify.mjs';
const sample=(network,mode,ms=100)=>({network,mode,host:'bbs.example.com',path:'/api/posts?page=1',mainlandConfirmed:true,
  startedAt:'2026-10-22T03:00:00Z',samples:Array.from({length:100},()=>({status:200,ms}))});
test('performance requires two real network declarations and paired data',()=>{
  assert.throws(()=>compareReports([sample('a','direct'),sample('a','proxied')]));
  const reports=['a','b'].flatMap(n=>[sample(n,'direct'),sample(n,'proxied',130)]);
  assert.equal(compareReports(reports).pass,true);
  reports[3].samples[0].status=500;reports[3].samples[1].status=500;
  assert.equal(compareReports(reports).pass,false);
});
test('latency and comparable-time thresholds fail closed',()=>{
  const reports=['a','b'].flatMap(n=>[sample(n,'direct'),sample(n,'proxied',131)]);
  assert.equal(compareReports(reports).pass,false);
  reports[3].startedAt='2026-10-23T03:00:00Z';
  assert.equal(compareReports(reports).networks[1].comparableTimes,false);
  assert.equal(summarize([{status:0,ms:15000}]).p95,null);
});
