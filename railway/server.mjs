import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { GET, POST } from '../app/api/attendance/route.ts';
import { GET as configuration } from '../app/api/setup/route.ts';
import { env } from './database.mjs';

const password=process.env.ADMIN_PASSWORD;
if(!password || password.length<16) throw Error('Set ADMIN_PASSWORD to a unique password of at least 16 characters.');
const origin=process.env.APP_ORIGIN || (process.env.RAILWAY_PUBLIC_DOMAIN && 'https://'+process.env.RAILWAY_PUBLIC_DOMAIN);
if(origin && new URL(origin).origin!==origin) throw Error('Generate a Railway public domain or set APP_ORIGIN to the public HTTPS origin.');
const adminAuth='Basic '+Buffer.from('admin:'+password).toString('base64');
const connectorAuth='Bearer '+env.OFFICE_SERVICE_TOKEN;
function matches(value,expected){
  const hash=s=>createHash('sha256').update(s).digest();
  return typeof value==='string' && timingSafeEqual(hash(value),hash(expected));
}
const home='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NTC Attendance</title><link rel="stylesheet" href="/client.css"><div id="root"></div><script defer src="/client.js"></script></html>';
const assets=new Map([
  ['/', ['text/html; charset=utf-8',home]],
  ['/client.js',['text/javascript',readFileSync('build/client.js')]],
  ['/client.css',['text/css',readFileSync('build/client.css')]],
  ['/office-connector.py',['application/octet-stream',readFileSync('public/office-connector.py')]]
]);
async function route(req){
  if(req.url==='/health' && req.method==='GET') return new Response('ok');
  if(!origin)return new Response('Generate a Railway public domain and redeploy.',{status:503});
  const url=new URL(req.url,origin);
  if(url.origin!==origin) return new Response(null,{status:400});
  const admin=matches(req.headers.authorization,adminAuth);
  const connector=matches(req.headers['oai-sites-authorization'],connectorAuth);
  if(!admin && !(connector && url.pathname==='/api/attendance' && req.method==='POST'))
    return new Response('Sign in with the office administrator account.',{status:401,headers:{'WWW-Authenticate':'Basic realm="NTC Attendance", charset="UTF-8"'}});
  const asset=assets.get(url.pathname);
  if(asset && req.method==='GET')return new Response(asset[1],{headers:{'Content-Type':asset[0]}});
  // Only forward identity assigned by this server.
  const headers=new Headers();
  if(admin) headers.set('oai-authenticated-user-id','admin');
  if(req.headers.origin)headers.set('origin',req.headers.origin);
  if(req.method==='GET'){
    const request=new Request(url,{headers});
    if(url.pathname==='/api/attendance')return GET(request);
    if(url.pathname==='/api/setup')return configuration(request);
  }
  if(req.method==='POST' && url.pathname==='/api/attendance'){
    let size=0;const chunks=[];
    for await(const chunk of req){size+=chunk.length;if(size>128*1024)return new Response(null,{status:413});chunks.push(chunk);}
    return POST(new Request(url,{method:'POST',headers,body:Buffer.concat(chunks)}));
  }
  return new Response('Not found',{status:404});
}
createServer(async(req,res)=>{
  try{
    const response=await route(req);
    res.writeHead(response.status,{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',...Object.fromEntries(response.headers)});
    res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){console.error(error.name);res.writeHead(500);res.end('Request failed.');}
}).listen(Number(process.env.PORT||3000),'0.0.0.0');
