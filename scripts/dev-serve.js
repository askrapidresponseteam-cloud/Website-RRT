// Minimal Vercel emulator: cleanUrls + rewrites + redirects + headers from vercel.json. /pl-api is left to the test harness.
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=process.argv[2], PORT=+process.argv[3]||8080;
const cfg=JSON.parse(fs.readFileSync(path.join(ROOT,'vercel.json'),'utf8'));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.json':'application/json','.xml':'application/xml','.txt':'text/plain','.webmanifest':'application/manifest+json','.mp4':'video/mp4','.webm':'video/webm','.woff2':'font/woff2'};
function match(pattern,p){ // supports :param and :param*
  const re='^'+pattern.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\/:(\w+)\*/g,'(?:/(.*))?').replace(/:(\w+)/g,'([^/]+)')+'$';
  return new RegExp(re).exec(p);
}
function file(p){
  p=decodeURIComponent(p);
  const cands=p.endsWith('/')?[p+'index.html']:[p,p+'.html',p+'/index.html'];
  for(const c of cands){const f=path.join(ROOT,c);if(f.startsWith(ROOT)&&fs.existsSync(f)&&fs.statSync(f).isFile())return f;}
  return null;
}
http.createServer((req,res)=>{
  const u=new URL(req.url,'http://x');let p=u.pathname;
  for(const r of cfg.redirects||[]){if(match(r.source,p)){res.writeHead(r.permanent?308:307,{Location:r.destination});return res.end();}}
  if(p.endsWith('.html')){res.writeHead(308,{Location:p.slice(0,-5)||'/'});return res.end();}
  let f=file(p);
  if(!f){for(const r of cfg.rewrites||[]){if(r.destination.startsWith('http'))continue;if(match(r.source,p)){f=file(r.destination);break;}}}
  if(!f){res.writeHead(404,{'Content-Type':'text/plain'});return res.end('404 '+p);}
  const hdrs={'Content-Type':types[path.extname(f)]||'application/octet-stream'};
  for(const h of cfg.headers||[]){if(match(h.source,p))for(const kv of h.headers)hdrs[kv.key]=kv.value;}
  res.writeHead(200,hdrs);
  fs.createReadStream(f).pipe(res);
}).listen(PORT,()=>console.log('serving',ROOT,PORT));
