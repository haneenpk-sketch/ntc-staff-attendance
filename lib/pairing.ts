// The QR is generated inside the private app. The pairing secret stays on site.
import QRCode from './qr/QRCode/index.js';
export async function digest(code:string){
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code));
 return Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export function qrImage(url:string){
 const code=new QRCode(-1,0);
 code.addData(url);
 code.make();
 const size=code.getModuleCount()+8;
 const path=[];
 for(let y=0;y<size-8;y++)for(let x=0;x<size-8;x++){
   if(code.isDark(y,x))path.push(`M${x+4} ${y+4}h1v1h-1z`);
 }
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path d="${path.join('')}"/></svg>`;
 return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
export function validOfficeIp(value:unknown){
 if(typeof value!=='string'||!/^\d{1,3}(\.\d{1,3}){3}$/.test(value))return false;
 const parts=value.split('.').map(Number);
 return parts.every((n,i)=>n<=255&&String(n)===value.split('.')[i])&&(parts[0]===10||(parts[0]===192&&parts[1]===168)||(parts[0]===172&&parts[1]>=16&&parts[1]<=31));
}
