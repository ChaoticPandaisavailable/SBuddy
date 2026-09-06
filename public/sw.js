const CACHE_NAME = 'study-buddies-shell-v30';
const CORE_ASSETS = ['/', '/manifest.webmanifest', '/favicon.svg', '/characters/female-rig.png', '/characters/male-rig.png', '/characters/study-props.png', '/characters/female-chibi-v2.png', '/characters/male-chibi-v2.png', '/scenes/library-v2.png', '/scenes/classroom-v2.png', '/scenes/desk-v2.png', '/characters/female-sprite-v3.png', '/characters/male-sprite-v3.png', '/characters/female-inbetweens-v1.png', '/characters/male-inbetweens-v1.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('study-buddies-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('/'))),
  );
});
