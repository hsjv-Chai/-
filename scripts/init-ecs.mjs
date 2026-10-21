import {openConnection,dataDir} from '../lib/node-storage.mjs';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID,randomBytes,pbkdf2Sync} from 'node:crypto';
const db=openConnection();
db.exec('CREATE TABLE IF NOT EXISTS _melon_migrations(name TEXT PRIMARY KEY,applied_at INTEGER NOT NULL)');
const journal=JSON.parse(readFileSync('drizzle/meta/_journal.json','utf8'));
for(const {tag} of journal.entries){if(db.prepare('SELECT name FROM _melon_migrations WHERE name=?').get(tag))continue;db.exec('BEGIN IMMEDIATE');try{db.exec(readFileSync(`drizzle/${tag}.sql`,'utf8'));db.prepare('INSERT INTO _melon_migrations VALUES(?,?)').run(tag,Date.now());db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}
for(const [id,name,description] of [['hot','热点现场','新鲜发生的事，一起聊聊'],['fun','娱乐吃瓜','电影、音乐和那些有趣的事'],['tech','科技互联网','新产品、新想法、新世界'],['life','生活杂谈','把日常的小事说给你听']])db.prepare('INSERT INTO categories(id,name,description) VALUES(?,?,?) ON CONFLICT DO NOTHING').run(id,name,description);
if(!db.prepare("SELECT id FROM users WHERE role='admin'").get()){
 const username=process.env.MELON_ADMIN_USERNAME||'melon_admin';
 if(db.prepare('SELECT id FROM users WHERE username=?').get(username))throw new Error('Admin username already belongs to a member');
 const password=randomBytes(24).toString('base64url'),salt=randomUUID(),hash=pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex');
 const credentials=join(dataDir(),'initial-admin.txt');
 if(existsSync(credentials))throw new Error('Existing credential file found; inspect before initializing');
 writeFileSync(credentials,`🍉 初始管理员\n用户名：${username}\n密码：${password}\n入口：${process.env.MELON_PUBLIC_ORIGIN||''}${process.env.NEXT_PUBLIC_BASE_PATH||''}/\n`,{mode:0o600});
 db.prepare('INSERT INTO users(id,username,nickname,password,role,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),username,'西瓜管理员',salt+':'+hash,'admin',Date.now());
 console.log('Administrator initialized; credentials saved privately in the data directory.');
}
console.log('Database initialized: four categories; no demo data inserted.');
