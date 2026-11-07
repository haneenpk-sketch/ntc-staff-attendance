import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const directory = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.DATA_DIR;
if (!directory) throw Error('Attach a Railway volume at /data, or set DATA_DIR for local development.');
mkdirSync(directory,{recursive:true});
const db = new DatabaseSync(join(directory,'attendance.db'));
db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS migration (name TEXT PRIMARY KEY);');
function transaction(work) {
  db.exec('BEGIN IMMEDIATE');
  try { const result=work(); db.exec('COMMIT'); return result; }
  catch(error) { db.exec('ROLLBACK'); throw error; }
}
transaction(()=>{
  for(const file of readdirSync('drizzle').filter(name=>name.endsWith('.sql')).sort()){
    if(db.prepare('SELECT 1 FROM migration WHERE name=?').get(file)) continue;
    db.exec(readFileSync(join('drizzle',file),'utf8'));
    db.prepare('INSERT INTO migration VALUES(?)').run(file);
  }
  db.exec('CREATE TABLE IF NOT EXISTS connector_secret (id INTEGER PRIMARY KEY, token TEXT NOT NULL)');
  db.prepare('INSERT OR IGNORE INTO connector_secret VALUES(1,?)').run(randomBytes(32).toString('hex'));
});
function prepare(sql, args=[]){
  const statement=db.prepare(sql);
  return {
    bind:(...values)=>prepare(sql,values),
    first:()=>statement.get(...args),
    run:()=>({meta:statement.run(...args)}),
    execute:()=>({results:statement.all(...args)})
  };
}
export const env={
  DB:{prepare,batch:statements=>transaction(()=>statements.map(statement=>statement.execute()))},
  OFFICE_SERVICE_TOKEN:db.prepare('SELECT token FROM connector_secret WHERE id=1').get().token
};
