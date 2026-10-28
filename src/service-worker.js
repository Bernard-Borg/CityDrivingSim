/* Replaced with a content-derived version and asset list by the production build. */
const CACHE = "wander-shell-__BUILD_VERSION__";
const FILES = __PRECACHE__;
const ROOT = new URL("./", self.location.href).href;

self.addEventListener("install", event => {
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
});

// Updates activate after existing tabs close, avoiding a forced reload while driving.
self.addEventListener("activate", event => {
    event.waitUntil(caches.keys().then(keys => Promise.all(
        keys.filter(key => key.startsWith("wander-shell-") && key !== CACHE)
            .map(key => caches.delete(key)),
    )));
});

self.addEventListener("fetch", event => {
    const request = event.request;
    const url = new URL(request.url);
    if (request.method !== "GET" || url.origin !== self.location.origin) return;
    // Never cache city datasets, elevation, models or music: these can be hundreds of MB.
    if (!FILES.some(file => new URL(file, ROOT).href === url.href) && request.mode !== "navigate") return;
    event.respondWith(caches.open(CACHE).then(async cache => {
        if (request.mode === "navigate") {
            try { return await fetch(request); }
            catch { return (await cache.match(new URL("index.html", ROOT).href)) || Response.error(); }
        }
        return (await cache.match(request)) || fetch(request);
    }));
});
