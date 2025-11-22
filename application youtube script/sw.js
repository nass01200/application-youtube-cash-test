const CACHE_NAME='dopeur-cache-v2'
const BASE=new URL(self.registration.scope).pathname.replace(/[^/]*$/,'')
const ASSETS=['','index.html','login.html','signup.html','forgot.html','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','screenshots/screen1.png','screenshots/screen2.png','screenshots/desktop.svg'].map(p=>BASE+p)

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{try{const c=await caches.open(CACHE_NAME);await c.addAll(ASSETS)}catch(e){};self.skipWaiting()})())
})

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)));await clients.claim()})())
})

self.addEventListener('fetch',event=>{
  const req=event.request
  if(req.method!=='GET')return
  event.respondWith((async()=>{
    const cached=await caches.match(req)
    try{
      const res=await fetch(req)
      try{if(res&&res.ok&&req.url.startsWith(self.location.origin)){const clone=res.clone();const c=await caches.open(CACHE_NAME);await c.put(req,clone)}}catch(e){}
      return cached||res
    }catch(e){
      if(cached)return cached
      if(req.mode==='navigate')return caches.match(BASE+'index.html')
      return new Response('Offline',{status:503,headers:{'Content-Type':'text/plain'}})
    }
  })())
})
