import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { randomUUID, pbkdf2Sync } from 'node:crypto';
import { resolve, join } from 'node:path';
import { openConnection } from '../../lib/node-storage.mjs';
const base=process.env.MELON_TEST_URL||'http://127.0.0.1:5202/melon';
const directory=resolve(process.env.MELON_DATA_DIR||'');
if(process.env.MELON_STORAGE!=='node'||!directory.includes('museum-qa')||!['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname))throw new Error('Museum tests require explicit museum-qa Node data and a loopback URL.');
const db=openConnection(),checkpoint=join(directory,'museum-checkpoint.json');
let checks=0;
const assertThat=(condition,message)=>{assert.ok(condition,message);checks++;};
async function call(path,method='GET',data,cookie='',status=200,extra={}){
 const response=await fetch(base+'/api/'+path,{method,headers:{Origin:new URL(base).origin,...(cookie?{Cookie:cookie}:{}),...(!(data instanceof FormData)?{'Content-Type':'application/json'}:{}),...extra},body:data===undefined?undefined:data instanceof FormData?data:JSON.stringify(data)});
 const value=(response.headers.get('content-type')||'').includes('application/json')?await response.json():new Uint8Array(await response.arrayBuffer());
 assert.equal(response.status,status,`${method} ${path}: ${JSON.stringify(value).slice(0,500)}`);checks++;
 assert.match(response.headers.get('cache-control')||'',/no-store/);checks++;
 return {value,cookie:response.headers.get('set-cookie')?.split(';')[0]||cookie,response};
}
const A={cookie:''},M={cookie:''};
async function admin(path,method='GET',data,status=200){return (await call('admin/museum/exhibitions'+path,method,data,A.cookie,status)).value;}
const imageBytes=readFileSync('tests/fixtures/image.png');
async function upload(eid,bytes=imageBytes,type='image/png',status=201){const form=new FormData();form.append('file',new Blob([bytes],{type}),'fixture.png');return admin('/'+eid+'/images','POST',form,status);}
function password(value,salt){return salt+':'+pbkdf2Sync(value,salt,100000,32,'sha256').toString('hex');}
function cleanup(tag){
 const imageIds=db.prepare("SELECT id FROM museum_images WHERE exhibition_id IN (SELECT id FROM museum_exhibitions WHERE id LIKE ?)").all(tag+'%').map(row=>row.id);
 db.exec('BEGIN IMMEDIATE');try{
  for(const sql of ["DELETE FROM museum_release_items WHERE release_id IN (SELECT id FROM museum_releases WHERE exhibition_id IN (SELECT id FROM museum_exhibitions WHERE id LIKE ?))","DELETE FROM museum_releases WHERE exhibition_id IN (SELECT id FROM museum_exhibitions WHERE id LIKE ?)","DELETE FROM museum_items WHERE exhibition_id IN (SELECT id FROM museum_exhibitions WHERE id LIKE ?)","DELETE FROM museum_images WHERE exhibition_id IN (SELECT id FROM museum_exhibitions WHERE id LIKE ?)","DELETE FROM museum_exhibitions WHERE id LIKE ?","DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username LIKE ?)","DELETE FROM users WHERE username LIKE ?"]){db.prepare(sql).run(tag+'%');}
  db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error;}
 for(const key of imageIds)try{unlinkSync(join(directory,'uploads',key));}catch{}
}
if(process.argv.includes('--after-restart')){
 if(!existsSync(checkpoint))throw new Error('Run the first phase before restarting the actual server.');
 const saved=JSON.parse(readFileSync(checkpoint,'utf8'));
 A.cookie=saved.cookie;
 const info=await admin('/'+saved.id);assert.equal(info.revision,saved.revision);checks++;
 assert.equal(info.draft.title,saved.draftTitle);checks++;
 const live=(await call('museum/exhibitions/'+saved.id)).value;assert.equal(live.exhibition.title,saved.publicTitle);checks++;
 await call('museum/items/'+saved.item);
 await call('museum/images/'+saved.image);
 await call('museum/images/'+saved.privateImage,'GET',undefined,'',404);
 const restored=(await call('auth/me','GET',undefined,A.cookie)).value;assert.equal(restored.user.role,'admin');checks++;
 cleanup(saved.tag);unlinkSync(checkpoint);
 console.log(`PASS: ${checks} museum restart/persistence assertions; snapshots, private image boundary and admin session retained.`);process.exit(0);
}
const tag='mqa_'+Date.now().toString(36)+'_',adminId=randomUUID(),memberId=randomUUID(),secret='Museum_Local_Test_123456';
for(const [id,name,role] of [[adminId,tag+'a','admin'],[memberId,tag+'m','member']])db.prepare('INSERT INTO users(id,username,nickname,password,role,created_at) VALUES(?,?,?,?,?,?)').run(id,name,'虚构博物馆测试账号',password(secret,id),role,Date.now());
A.cookie=(await call('auth/login','POST',{username:tag+'a',password:secret})).cookie;
M.cookie=(await call('auth/login','POST',{username:tag+'m',password:secret})).cookie;
let eid,revision;
const created=[];
try{
 await call('admin/museum/exhibitions','GET',undefined,'',401);
 await call('admin/museum/exhibitions','GET',undefined,M.cookie,403);
 await call('admin/museum/exhibitions','POST',{},A.cookie,403,{Origin:'https://cross-site.example'});
 let e=await admin('','POST',{} ,201);eid=e.id;revision=e.revision;
 // Retag only this test-owned draft for deterministic, isolated cleanup.
 const desired=tag+'exhibition';db.prepare('UPDATE museum_exhibitions SET id=? WHERE id=?').run(desired,eid);eid=desired;created.push(eid);
 await call('museum/exhibitions/'+eid,'GET',undefined,'',404);
 await call('admin/museum/exhibitions/'+eid+'/preview','GET',undefined,M.cookie,403);
 await admin('/'+eid+'/publish','POST',{revision},400);
 await upload(eid,Buffer.from('not an image'),'image/png',400);
 await upload(eid,Buffer.alloc(0),'image/png',400);
 await upload(eid,imageBytes,'image/jpeg',400);
 await upload(eid,Buffer.alloc(5*1024*1024+1),'image/png',413);
 const image=(await upload(eid)).id;
 await call('museum/images/'+image,'GET',undefined,'',404);
 await call('museum/images/'+image,'GET',undefined,M.cookie,404);
 const privateRead=await call('museum/images/'+image,'GET',undefined,A.cookie);assert.match(privateRead.response.headers.get('cache-control'),/private/);checks++;
 const draft={title:'测试主题展览',summary:'用于验证原子发布与权限的虚构介绍',body:'## 策展手记\n<script>普通文字</script>',cover:image,coverAlt:'测试封面'};
 revision=(await admin('/'+eid,'PATCH',{revision,draft})).revision;
 await admin('/'+eid,'PATCH',{revision:revision-1,draft},409);
 const item={title:'虚构展品甲',body:'仅用于本地测试。',maker:'示意作者',era:'虚构',source:'本地测试',images:[{id:image,alt:'示意图',caption:'图注'}]};
 const item1=await admin('/'+eid+'/items','POST',{revision,item},201);revision=item1.revision;
 await admin('/'+eid+'/items','POST',{revision,item:{...item,images:Array.from({length:10},()=>item.images[0])}},400);
 await admin('/'+eid+'/items','POST',{revision,item:{...item,images:[item.images[0],item.images[0]]}},400);
 const item2=await admin('/'+eid+'/items','POST',{revision,item:{...item,title:'虚构展品乙'}},201);revision=item2.revision;
 revision=(await admin('/'+eid+'/publish','POST',{revision})).revision;
 let published=(await call('museum/exhibitions/'+eid)).value;assert.equal(published.items.length,2);checks++;
 assert.equal(published.exhibition.title,draft.title);checks++;
 assertThat(!JSON.stringify(published).includes('created_by')&&!JSON.stringify(published).includes('email')&&!JSON.stringify(published).includes('mutation_token'),'public payload has no private account/version fields');
 await call('museum/images/'+image);
 const neighbors=(await call('museum/items/'+item1.id)).value;assert.equal(neighbors.next.id,item2.id);checks++;
 const secondImage=(await upload(eid)).id;
 const changedDraft={...draft,title:'尚未公开的新标题',cover:secondImage,coverAlt:'新封面'};
 revision=(await admin('/'+eid,'PATCH',{revision,draft:changedDraft})).revision;
 revision=(await admin('/'+eid+'/items/'+item1.id,'PATCH',{revision,item:{...item,title:'尚未公开的新展品',images:[{id:secondImage,alt:'新图',caption:''}]}})).revision;
 assert.equal((await call('museum/exhibitions/'+eid)).value.exhibition.title,draft.title);checks++;
 await call('museum/images/'+secondImage,'GET',undefined,'',404);
 const preview=await admin('/'+eid+'/preview');assert.equal(preview.draft.title,changedDraft.title);checks++;
 await admin('/'+eid+'/reorder','POST',{revision,ids:[item1.id,item1.id]},400);
 revision=(await admin('/'+eid+'/reorder','POST',{revision,ids:[item2.id,item1.id]})).revision;
 assert.equal((await call('museum/exhibitions/'+eid)).value.items[0].id,item1.id);checks++;
 // A failed transaction cannot increment revision or replace the public pointer.
 db.exec("CREATE TRIGGER museum_qa_fail BEFORE INSERT ON museum_releases BEGIN SELECT RAISE(ABORT,'QA_MUSEUM_TRANSACTION_FAILURE'); END;");
 await admin('/'+eid+'/publish','POST',{revision},500);
 db.exec('DROP TRIGGER museum_qa_fail');
 assert.equal((await admin('/'+eid)).revision,revision);checks++;
 assert.equal((await call('museum/exhibitions/'+eid)).value.exhibition.title,draft.title);checks++;
 const concurrent=await Promise.all([fetch(base+'/api/admin/museum/exhibitions/'+eid,{method:'PATCH',headers:{Origin:new URL(base).origin,Cookie:A.cookie,'Content-Type':'application/json'},body:JSON.stringify({revision,draft:changedDraft})}),fetch(base+'/api/admin/museum/exhibitions/'+eid,{method:'PATCH',headers:{Origin:new URL(base).origin,Cookie:A.cookie,'Content-Type':'application/json'},body:JSON.stringify({revision,draft:changedDraft})})]);
 assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);checks++;await Promise.all(concurrent.map(r=>r.arrayBuffer()));revision++;
 revision=(await admin('/'+eid+'/items/'+item2.id,'DELETE',{revision})).revision;
 revision=(await admin('/'+eid+'/publish','POST',{revision})).revision;
 published=(await call('museum/exhibitions/'+eid)).value;assert.equal(published.items.length,1);checks++;
 await call('museum/items/'+item2.id,'GET',undefined,'',404);
 await call('museum/images/'+image,'GET',undefined,'',404);await call('museum/images/'+secondImage);
 const other=await admin('','POST',{},201);const otherId=tag+'other';db.prepare('UPDATE museum_exhibitions SET id=? WHERE id=?').run(otherId,other.id);created.push(otherId);
 const foreign=(await upload(otherId)).id;
 await admin('/'+eid,'PATCH',{revision,draft:{...changedDraft,cover:foreign}},400);
 await admin('/'+eid+'/items','POST',{revision,item:{...item,images:[{id:foreign,alt:'跨展览',caption:''}]}},400);
 const forumForm=new FormData();forumForm.append('file',new Blob([imageBytes],{type:'image/png'}),'forum-fixture.png');
 const forumImage=(await call('uploads','POST',forumForm,A.cookie,201)).value.id;
 await admin('/'+eid,'PATCH',{revision,draft:{...changedDraft,cover:forumImage}},400);
 await call('uploads/'+secondImage,'GET',undefined,'',404);
 db.prepare('DELETE FROM uploads WHERE id=?').run(forumImage);unlinkSync(join(directory,'uploads',forumImage));
 await call('museum/exhibitions/'+eid+'/extra','GET',undefined,'',404);
 await call('admin/museum/exhibitions/'+eid+'/preview/extra','GET',undefined,A.cookie,404);
 await call('admin/museum/exhibitions/'+eid+'/unknown','POST',{},A.cookie,404);
 await call('admin/museum/exhibitions/'+eid+'/images/extra','POST',{},A.cookie,404);
 await call('museum/items/'+item1.id+'/extra','GET',undefined,'',404);
 await call('museum/items/not-exists','GET',undefined,'',404);
 await call('museum/exhibitions/not-exists','GET',undefined,'',404);
 revision=(await admin('/'+eid+'/unpublish','POST',{revision})).revision;
 await call('museum/exhibitions/'+eid,'GET',undefined,'',404);await call('museum/items/'+item1.id,'GET',undefined,'',404);await call('museum/images/'+secondImage,'GET',undefined,'',404);
 assertThat((await admin('/'+eid)).items.length===1,'unpublish retains working draft');
 revision=(await admin('/'+eid+'/publish','POST',{revision})).revision;
 // Account state is rechecked by both the auth gate and the conditional transaction.
 const restrictedRoom=tag+'restriction-room';
 db.prepare("INSERT INTO game_rooms(id,owner_id,game,phase,state,version,created_at,updated_at) VALUES(?,?,'doudizhu','playing',?,0,?,?)").run(restrictedRoom,adminId,JSON.stringify({seats:[{id:adminId}]}),Date.now(),Date.now());
 db.prepare("UPDATE users SET account_status='restricted',restricted_room_id=?,ban_reason='fixture',account_version=account_version+1 WHERE id=?").run(restrictedRoom,adminId);
 await call('admin/museum/exhibitions','GET',undefined,A.cookie,403);
 db.prepare("UPDATE users SET account_status='active',restricted_room_id=NULL,account_version=account_version+1 WHERE id=?").run(adminId);
 db.prepare('DELETE FROM game_rooms WHERE id=?').run(restrictedRoom);
 A.cookie=(await call('auth/login','POST',{username:tag+'a',password:secret})).cookie;
 const extraIds=[];
 for(let n=0;n<20;n++){const entry=await admin('/'+eid+'/items','POST',{revision,item:{...item,title:'分页展品'+n,images:[{id:secondImage,alt:'分页图',caption:''}]}},201);revision=entry.revision;extraIds.push(entry.id);}
 revision=(await admin('/'+eid+'/publish','POST',{revision})).revision;
 const page1=(await call('museum/exhibitions/'+eid+'?page=1')).value,page2=(await call('museum/exhibitions/'+eid+'?page=2')).value;
 assert.equal(page1.items.length,20);assert.equal(page2.items.length,1);assert.equal(page2.total,21);checks+=3;
 const time=Date.now();for(let n=0;n<12;n++){const key=tag+'page'+n,release=tag+'release'+n;created.push(key);db.prepare('INSERT INTO museum_exhibitions(id,draft,live_release_id,is_public,created_at,updated_at,published_at) VALUES(?,?,?,1,?,?,?)').run(key,JSON.stringify(draft),release,time,time,time+n);db.prepare('INSERT INTO museum_releases VALUES(?,?,?,?)').run(release,key,JSON.stringify(draft),time);}
 const all1=(await call('museum/exhibitions')).value,all2=(await call('museum/exhibitions?page=2')).value;assert.equal(all1.items.length,12);assert.equal(all2.items.length,1);checks+=2;
 const search=(await call('museum/exhibitions?q='+encodeURIComponent('尚未公开的新标题'))).value;assert.equal(search.total,1);checks++;
 const miss=(await call('museum/exhibitions?q='+encodeURIComponent('不存在的展览'))).value;assert.equal(miss.total,0);checks++;
 // Remove only bulk pagination fixtures, retaining one real public snapshot for restart.
 for(let n=0;n<12;n++){db.prepare('DELETE FROM museum_releases WHERE id=?').run(tag+'release'+n);db.prepare('DELETE FROM museum_exhibitions WHERE id=?').run(tag+'page'+n);}
 const privateImage=(await upload(eid)).id;
 revision=(await admin('/'+eid,'PATCH',{revision,draft:{...changedDraft,title:'重启后仍为私密草稿'}})).revision;
 writeFileSync(checkpoint,JSON.stringify({tag,id:eid,revision,cookie:A.cookie,item:item1.id,image:secondImage,privateImage,draftTitle:'重启后仍为私密草稿',publicTitle:changedDraft.title}),{mode:0o600});
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);checks++;
 console.log(`PASS: ${checks} museum API assertions; real transaction rollback, concurrent version conflict, publication/image isolation and pagination verified. Restart the server and run --after-restart.`);
}catch(error){try{db.exec('DROP TRIGGER IF EXISTS museum_qa_fail')}catch{};throw error;}
