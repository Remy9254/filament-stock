const CACHE_PREFIX = "filament-stock-v2-";
const CACHE = CACHE_PREFIX + "phone-4";
const ASSETS = ["./", "index.html", "app.js", "sync.js", "mobile.css", "mobile.js", "manifest.webmanifest", "icon-192.svg", "icon-512.svg", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];
self.addEventListener("install", event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(()=>self.skipWaiting())); });
self.addEventListener("activate", event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", event => {
 const url = new URL(event.request.url); if (event.request.method !== "GET" || !url.href.startsWith(self.registration.scope)) return;
 event.respondWith(caches.open(CACHE).then(async cache => { try { const response=await fetch(event.request); if(response.ok&&response.type==="basic") event.waitUntil(cache.put(event.request,response.clone())); return response; } catch(error) { const cached=await cache.match(event.request); if(cached)return cached; if(event.request.mode==="navigate"){const fallback=await cache.match(new URL("./",self.registration.scope).href);if(fallback)return fallback} throw error; } }));
});
