import { resolve, relative, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { museumDemoImage } from './museum-demo-images.mjs';
const dir=resolve(process.env.MELON_DATA_DIR||'');
const local=relative(resolve('.sites-runtime'),dir);
if(process.env.MELON_STORAGE!=='node'||!process.env.MELON_DATA_DIR||local.startsWith('..')||!/(museum-demo|museum-qa)/.test(local))throw new Error('Demo seed requires Node storage and an explicit .sites-runtime/museum-demo or museum-qa directory.');
const {openConnection}=await import('../lib/node-storage.mjs');
const db=openConnection();
const admin=db.prepare("SELECT id FROM users WHERE role='admin' AND account_status='active' LIMIT 1").get();
if(!admin)throw new Error('Run init:ecs in this isolated directory first.');
mkdirSync(join(dir,'uploads'),{recursive:true,mode:0o700});
const titles=['旋钮与光线：日常物件观察室【虚构展览】','一张纸的六种可能【虚构展览】'];
const summaries=['从相机、收音机到时钟，重新看见熟悉的形状。本展品与配图均为原创示意，不对应真实馆藏。','用色块、窗口和台阶，记录纸面上的想象。本展览仅作本地功能与视觉演示。'];
const names=['方形相机','午后的收音机','一圈时间','纸上的轨道','一扇窗口','向上的台阶'];
let added=0;
for(let exhibitionIndex=0;exhibitionIndex<2;exhibitionIndex++){
 const eid='museum-demo-exhibition-'+exhibitionIndex;
 if(db.prepare('SELECT id FROM museum_exhibitions WHERE id=?').get(eid))continue;
 const start=exhibitionIndex*3,cover='museum-demo-image-'+start,time=Date.now()-exhibitionIndex*86400000,release='museum-demo-release-'+exhibitionIndex;
 const draft={title:titles[exhibitionIndex],summary:summaries[exhibitionIndex],body:'## 策展手记\n【虚构演示内容】这是一组为本地博物馆功能绘制的平面示意图。我们从日常物件与纸面构成出发，用图像与文字练习观察。\n\n所有资料均为虚构，配图不代表真实文物、历史物件或实际收藏。',cover,coverAlt:'原创示意配图：'+names[start]};
 for(let i=start;i<start+3;i++)writeFileSync(join(dir,'uploads','museum-demo-image-'+i),museumDemoImage(i),{mode:0o600});
 db.exec('BEGIN IMMEDIATE');try{
  db.prepare('INSERT INTO museum_exhibitions(id,draft,revision,live_release_id,is_public,created_at,updated_at,published_at) VALUES(?,?,1,?,1,?,?,?)').run(eid,JSON.stringify(draft),release,time,time,time);
  db.prepare('INSERT INTO museum_releases(id,exhibition_id,content,created_at) VALUES(?,?,?,?)').run(release,eid,JSON.stringify(draft),time);
  for(let i=start;i<start+3;i++){
   const iid='museum-demo-item-'+i,image='museum-demo-image-'+i;
   const item={title:names[i]+'【虚构展品】',body:'【虚构演示内容】\n\n这件展品是原创程序绘制的示意图，用于检查图文阅读、图片放大与展品切换。\n\n## 观察笔记\n留意形状、留白与色彩之间的关系。图片为本地原创配图，不是历史文物照片。',maker:'🍉 本地演示',era:'虚构示意',source:'程序绘制，不对应真实馆藏',images:[{id:image,alt:'原创平面示意图：'+names[i],caption:'虚构展品 · 本地原创 PNG 示意图'}]};
   if(i===0)item.images.push({id:'museum-demo-image-1',alt:'同一展览中的另一件原创示意图：收音机',caption:'图集演示：同展览的第二幅配图'});
   db.prepare('INSERT INTO museum_images(id,exhibition_id,mime,created_by,created_at) VALUES(?,?,?,?,?)').run(image,eid,'image/png',admin.id,time);
   db.prepare('INSERT INTO museum_items(id,exhibition_id,content,position) VALUES(?,?,?,?)').run(iid,eid,JSON.stringify(item),i-start);
   db.prepare('INSERT INTO museum_release_items(release_id,item_id,position,content) VALUES(?,?,?,?)').run(release,iid,i-start,JSON.stringify(item));
  }
  db.exec('COMMIT');added++;
 }catch(error){db.exec('ROLLBACK');throw error;}
}
console.log(`Museum demo ready: ${added} new exhibitions; existing demo content left unchanged. No real collection data or external images used.`);
