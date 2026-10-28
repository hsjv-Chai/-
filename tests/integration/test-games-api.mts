import {testFetch as fetch} from "../helpers/verified-registration.mjs";
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {sortCards,weight} from '../../lib/games/cards.ts';
const base=process.env.MELON_TEST_URL||'http://127.0.0.1:5173/melon';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname)||!process.env.MELON_DATA_DIR?.includes('card-room-qa'))throw new Error('Requires an isolated local card-room-qa database');
const db=new DatabaseSync(join(process.env.MELON_DATA_DIR,'melon.sqlite'));
const tag='cards_'+Date.now(),clients=Array.from({length:5},()=>({cookie:'',id:''})),roomIds:string[]=[];
let checks=0;
async function api(path:string,method='GET',data?:unknown,client=clients[0],status=200,origin=new URL(base).origin){const r=await fetch(base+'/api/'+path,{method,headers:{'Content-Type':'application/json',Origin:origin,...(client.cookie?{Cookie:client.cookie}:{})},body:data===undefined?undefined:JSON.stringify(data)});const b=await r.json() as any;assert.equal(r.status,status,`${method} ${path}: ${JSON.stringify(b)}`);checks++;assert.equal(r.headers.get('cache-control'),'no-store');checks++;if(r.headers.get('set-cookie'))client.cookie=r.headers.get('set-cookie')!.split(';')[0];return b;}
try {
 for(let i=0;i<5;i++){await api('auth/register','POST',{username:tag+'_'+i,nickname:'联机验证'+i,password:'LocalCardQa_12345'},clients[i]);clients[i].id=(await api('auth/me','GET',undefined,clients[i])).user.id;}
 await api('games','GET',undefined,{cookie:'',id:''},401);
 await api('games','POST',{game:'fake'},clients[0],400);
 await api('games','POST',{game:'doudizhu'},clients[0],403,'https://invalid.example');
 await api('games/'+randomUUID(),'GET',undefined,clients[0],404);
 for(const game of ['doudizhu','guandan'] as const){
  let r=await api('games','POST',{game},clients[0],201);const rid=r.id;roomIds.push(rid);
  const n=game==='doudizhu'?3:4;
  const simultaneous=await Promise.all([1,2].map(i=>fetch(base+'/api/games/'+rid,{method:'POST',headers:{'Content-Type':'application/json',Origin:new URL(base).origin,Cookie:clients[i].cookie},body:JSON.stringify({type:'join',version:r.version,value:1})})));
  assert.deepEqual(simultaneous.map(x=>x.status).sort(),[200,409]);checks++;
  r=await api('games/'+rid);for(let i=1;i<n;i++){if(r.seats.some((p:any)=>p?.id===clients[i].id))continue;r=await api('games/'+rid,'POST',{type:'join',version:r.version},clients[i]);}
  await api('games/'+rid,'POST',{type:'join',version:r.version},clients[4],400);
  await api('games/'+rid,'POST',{type:'ready',version:r.version},clients[4],400);
  await api('games/'+rid,'POST',{type:'ready',version:r.version-1},clients[0],409);
  for(let i=0;i<n;i++)r=await api('games/'+rid,'POST',{type:'ready',version:r.version},clients[i]);
  const spectator=await api('games/'+rid,'GET',undefined,clients[4]);assert.equal(spectator.hand.length,0);assert.equal(spectator.bottom.length,0);assert.ok(!('hands'in spectator));checks+=3;
  const whose=()=>clients.find(c=>c.id===r.seats[r.turn].id)!;
  const outsider=clients.find(c=>c.id!==r.seats[r.turn].id)!;
  await api('games/'+rid,'POST',{type:'play',version:r.version,cards:[9999]},outsider,400);
  await api('games/'+rid,'POST',{type:'tick',version:r.version},clients[4],400);
  if(r.phase==='bidding')r=await api('games/'+rid,'POST',{type:'bid',value:3,version:r.version},whose());
  await api('games/'+rid,'POST',{type:'play',version:r.version,cards:[9999]},whose(),400);
  let count=0;
  while(r.phase==='playing'&&count++<800){
    const client=whose();r=await api('games/'+rid,'GET',undefined,client);
    const sorted=sortCards(r.hand,game,r.level).reverse();
    const c=sorted.find(c=>!r.last||weight(c.rank,game,r.level)>r.last.pattern.rank);
    r=await api('games/'+rid,'POST',{type:c?'play':'pass',cards:c?[c.id]:undefined,version:r.version},client);
    assert.ok(!('hands'in r));if(r.phase==='playing')assert.deepEqual(r.revealedHands,[]);checks++;
  }
  assert.ok(count<800);assert.ok(['finished','roundEnd'].includes(r.phase));checks+=2;
  const revealed=await api('games/'+rid,'GET',undefined,clients[4]);
  const stored=JSON.parse((db.prepare('SELECT state FROM game_rooms WHERE id=?').get(rid) as {state:string}).state);
  assert.deepEqual(revealed.revealedHands.map((h:any)=>h.seat),stored.hands.flatMap((h:any[],i:number)=>h.length?[i]:[]));
  for(const h of revealed.revealedHands)assert.deepEqual(h.cards.map((c:any)=>c.id).sort(),stored.hands[h.seat].map((c:any)=>c.id).sort());checks++;
  if(game==='guandan'){
    for(let i=0;i<n;i++)r=await api('games/'+rid,'POST',{type:'ready',version:r.version},clients[i]);
    assert.equal(r.round,2);assert.deepEqual(r.revealedHands,[]);checks++;
    while(r.phase==='tribute'||r.phase==='return'){const c=whose();r=await api('games/'+rid,'GET',undefined,c);r=await api('games/'+rid,'POST',{type:'exchange',cards:[r.exchangeAllowed[0]],version:r.version},c);}
    assert.equal(r.phase,'playing');checks++;
  }
  const saved=db.prepare('SELECT state,version FROM game_rooms WHERE id=?').get(rid)!;assert.equal(saved.version,r.version);checks++;
  const reconnect=await api('games/'+rid,'GET',undefined,clients[0]);assert.equal(reconnect.version,r.version);checks++;
  r=await api('games/'+rid,'POST',{type:'leave',version:r.version},clients[1]);
  r=await api('games/'+rid,'POST',{type:'rematch',version:r.version},clients[0]);assert.equal(r.phase,'waiting');checks++;
  // Release all seats before this group moves to the other game type.
  for(const client of clients)if(r.seats.some((p:any)=>p?.id===client.id))r=await api('games/'+rid,'POST',{type:'leave',version:r.version},client);
 }
 const listing=await api('games');assert.ok(listing.rooms.every((r:any)=>!('state'in r)&&!('hand'in r)&&!('hands'in r)));checks++;
 const invalid={cookie:clients[4].cookie+'invalid',id:''};await api('games','GET',undefined,invalid,401);
 console.log(`Card room API: ${checks} assertions passed; five accounts, both full rounds, concurrent joins, privacy, CSRF, invalid actions, next-round tribute and reconnect.`);
} finally {
 for(const rid of roomIds)db.prepare('DELETE FROM game_rooms WHERE id=?').run(rid);
 for(let i=0;i<clients.length;i++){const uid=clients[i].id;if(uid){db.prepare('DELETE FROM sessions WHERE user_id=?').run(uid);db.prepare('DELETE FROM users WHERE id=?').run(uid);}db.prepare('DELETE FROM auth_attempts WHERE key=?').run(tag+'_'+i);}
 db.close();
}
