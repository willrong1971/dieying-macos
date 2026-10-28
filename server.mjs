import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.MAJIANG_PORT||8787);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.glb':'model/gltf-binary','.ico':'image/x-icon','.woff2':'font/woff2','.m4a':'audio/mp4','.wav':'audio/wav'};
const server=http.createServer(async(req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  if(req.url==='/__workshop_health'){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({app:'mahjong-math-workshop',version:'1.0.0'}));return;}
  let url;try{url=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);res.end();return;}
  const file=path.resolve(root,'.'+(url==='/'?'/index.html':url));
  if(!file.startsWith(root+path.sep)||url.includes('/.')){res.writeHead(403);res.end();return;}
  try{
    const info=await stat(file);if(!info.isFile())throw new Error('not-file');
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':info.size,'Cache-Control':url.startsWith('/exports/')||url.startsWith('/vendor/')||url.startsWith('/public/')?'public, max-age=3600':'no-cache','X-Content-Type-Options':'nosniff'});
    if(req.method==='HEAD')res.end();else createReadStream(file).pipe(res);
  }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log(`麻将数学工坊  http://127.0.0.1:${port}`));
process.on('SIGTERM',()=>server.close());
process.on('SIGINT',()=>server.close());
