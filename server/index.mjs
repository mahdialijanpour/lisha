import http from 'node:http';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {createPrintApi} from './api.mjs';
const api=createPrintApi({dataDir:path.resolve(process.env.LISHA_DATA_DIR||'data')});
const root=path.resolve('dist');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.ico':'image/x-icon'};
http.createServer((req,res)=>api(req,res,async()=>{
 try{
  const url=new URL(req.url,'http://local');let file=path.resolve(root,`.${decodeURIComponent(url.pathname)}`);
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);return res.end()}
  if(!path.extname(file))file=path.join(root,'index.html');
  const bytes=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});res.end(bytes);
 }catch{res.writeHead(404);res.end('Not found')}
})).listen(Number(process.env.PORT||3000),process.env.HOST||'0.0.0.0',()=>console.log(`Lisha ready on port ${process.env.PORT||3000}`));
