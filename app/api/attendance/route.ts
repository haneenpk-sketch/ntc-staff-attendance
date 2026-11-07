import {env} from 'cloudflare:workers';
import {digest,qrImage,validOfficeIp} from '../../../lib/pairing';
export const dynamic='force-dynamic';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
const admin=(r:Request)=>Boolean(r.headers.get('oai-authenticated-user-id'));
const mac=/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/;
export async function GET(r:Request){
 if(!admin(r))return json({error:'Sign in to view attendance.'},403);
 const db=env.DB!;
 const day=new URL(r.url).searchParams.get('date')||new Date(Date.now()+19800000).toISOString().slice(0,10);
 const start=Date.parse(day+'T00:00:00+05:30'), end=start+86400000;
 if(!Number.isFinite(start))return json({error:'Invalid date'},400);
 const [people,changes,previous,heartbeat]=await db.batch([
 db.prepare('SELECT mac,name,mobile FROM staff ORDER BY name'),
 db.prepare('SELECT * FROM events WHERE at>=? AND at<? ORDER BY id').bind(start,end),
 db.prepare('SELECT e.* FROM events e JOIN (SELECT mac,MAX(id) id FROM events WHERE at<? GROUP BY mac) p ON e.id=p.id').bind(start),
 db.prepare('SELECT at FROM sync WHERE id=1')]);
 return json({people:people.results,events:changes.results,previous:previous.results,sync:heartbeat.results[0]?.at||0});
}
export async function POST(r:Request){
 const b=await r.json().catch(()=>null);
 if(!b)return json({error:'Invalid request'},400);
 const db=env.DB!;
 if(b.action==='invite'){
   if(!admin(r)||r.headers.get('origin')!==new URL(r.url).origin)return json({error:'Sign in required'},403);
   const hub=await db.prepare('SELECT pair_ip,at FROM sync WHERE id=1').first<{pair_ip:string,at:number}>();
   if(!hub||!validOfficeIp(hub.pair_ip)||Date.now()-hub.at>120000)
     return json({error:'Staff saved. Start the updated office connector, then choose Pair phone in Staff directory.'},409);
   const code=crypto.randomUUID(),expires=Date.now()+600000;
   const url='http://'+hub.pair_ip+':8788/pair#'+code;
   const image=qrImage(url);
   const res=await db.prepare("UPDATE staff SET pair_hash=?,pair_expires=? WHERE mac=? AND mac LIKE 'pending-%'").bind(await digest(code),expires,String(b.staff)).run();
   return res.meta.changes?json({image,expires}):json({error:'This phone has already been paired or the staff record is unavailable.'},409);
 }
 if(b.action==='redeem'){
   if(admin(r)||r.headers.get('origin'))return json({error:'Connector required'},403);
   if(typeof b.code!=='string'||b.code.length!==36||typeof b.device!=='string'||!mac.test(b.device))return json({error:'Invalid pairing request'},400);
   const res=await db.prepare("UPDATE OR IGNORE staff SET mac=?,pair_hash=NULL,pair_expires=NULL WHERE pair_hash=? AND pair_expires>? AND mac LIKE 'pending-%'").bind(b.device,await digest(b.code),Date.now()).run();
   return res.meta.changes?json({ok:true}):json({error:'Code expired, already used, or device already registered.'},409);
 }
 if(b.action==='staff'||b.action==='updateMobile'){
 if(!admin(r)||r.headers.get('origin')!==new URL(r.url).origin)return json({error:'Sign in required'},403);
 const name=String(b.name||'').trim(),address=String(b.mac||'').trim().toLowerCase();
 const digits=String(b.mobile??'').trim().replace(/[ ()-]/g,'');
 const match=/^(?:[+]?91|0)?([6-9][0-9]{9})$/.exec(digits);
 if(!match)return json({error:'Enter a 10-digit Indian mobile number, optionally starting with +91.'},400);
 const mobile='+91'+match[1];
 if(b.action==='updateMobile'){
 const result=await db.prepare('UPDATE OR IGNORE staff SET mobile=? WHERE mac=?').bind(mobile,address).run();
 return result.meta.changes?json({ok:true}):json({error:'Number already linked or staff record unavailable.'},409);
 }
 if(!name||name.length>80||(address&&!mac.test(address)))return json({error:'Enter a name and a valid Wi-Fi MAC address.'},400);
 const key=address||'pending-'+crypto.randomUUID();
 const result=await db.prepare('INSERT OR IGNORE INTO staff(mac,name,mobile) VALUES (?,?,?)').bind(key,name,mobile).run();
 return result.meta.changes?json({ok:true,key}):json({error:'This device or mobile number is already registered.'},409);
 }
 if(b.action!=='snapshot'||r.headers.get('origin')||admin(r))return json({error:'Connector access required'},403);
 if(!Array.isArray(b.devices)||b.devices.length>4000||!b.devices.every((s:unknown)=>typeof s==='string'&&mac.test(s)))return json({error:'Invalid device list'},400);
 const t=Date.now(),list=JSON.stringify(b.devices);
 await db.batch([db.prepare(`INSERT INTO events(mac,at,online)
 SELECT s.mac,?,s.mac IN (SELECT value FROM json_each(?)) FROM staff s
 WHERE (s.mac IN (SELECT value FROM json_each(?))) != COALESCE((SELECT online FROM events e WHERE e.mac=s.mac ORDER BY id DESC LIMIT 1),0)`).bind(t,list,list),
 db.prepare('INSERT INTO sync(id,at,pair_ip) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET at=excluded.at,pair_ip=excluded.pair_ip').bind(t,validOfficeIp(b.pairIp)?b.pairIp:null)]);
 return json({ok:true});
}
