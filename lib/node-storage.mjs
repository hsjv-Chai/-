import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
let connection;
export const dataDir=()=>resolve(process.env.MELON_DATA_DIR||'.melon-data');
export function openConnection(){
 if(!connection){mkdirSync(dataDir(),{recursive:true,mode:0o700});connection=new DatabaseSync(join(dataDir(),'melon.sqlite'));connection.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');}
 return connection;
}
function file(key){if(!/^[a-zA-Z0-9_-]{1,100}$/.test(key))throw new Error('Invalid object key');const dir=join(dataDir(),'uploads');mkdirSync(dir,{recursive:true,mode:0o700});return join(dir,key);}
class BoundStatement{
 constructor(query,values=[]){this.query=query;this.values=values;}
 bind(...values){return new BoundStatement(this.query,values);}
 async first(){return openConnection().prepare(this.query).get(...this.values)??null;}
 async all(){return {results:openConnection().prepare(this.query).all(...this.values)};}
 runSync(){const result=openConnection().prepare(this.query).run(...this.values);return {meta:{changes:Number(result.changes)}};}
 async run(){return this.runSync();}
}
export const nodeStorage={
 DB:{prepare(query){return new BoundStatement(query);},async batch(statements){const db=openConnection();db.exec('BEGIN IMMEDIATE');try{const result=statements.map(s=>s.runSync());db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}},
 BUCKET:{async put(key,bytes){const dest=file(key),temp=dest+'.'+randomUUID()+'.tmp';writeFileSync(temp,bytes,{mode:0o600});renameSync(temp,dest);},async get(key){const path=file(key);if(!existsSync(path))return null;return {body:new Uint8Array(readFileSync(path))};},async delete(key){try{unlinkSync(file(key));}catch(error){if(error.code!=='ENOENT')throw error;}}}
};
