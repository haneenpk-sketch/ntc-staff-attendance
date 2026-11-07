import {env} from 'cloudflare:workers';
export const dynamic='force-dynamic';
export async function GET(r:Request){
 if(!r.headers.get('oai-authenticated-user-id'))return new Response('Sign in required',{status:403});
 const token=(env as unknown as Record<string,string>).OFFICE_SERVICE_TOKEN;
 if(!token)return new Response('Connector credential unavailable',{status:503});
 return Response.json({url:new URL('/api/attendance',r.url).href,token,routers:[{host:'office-router',interfaces:['wlan0']}]},{headers:{'Cache-Control':'no-store','Content-Disposition':'attachment; filename="office-config.json"'}});
}
