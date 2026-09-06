const CACHE_NAME = 'defi-cgs-v4';
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/ethers/5.7.2/ethers.umd.min.js'
];
const SHELL_CROSS_ORIGIN = ['cdnjs.cloudflare.com'];

// Install — cache the app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy:
//   - anything cross-origin that is not app shell (RPC, price APIs, explorers) → network-only,
//     passed straight through. Раньше здесь был белый список хостов, и всё, чего в нём нет,
//     попадало в stale-while-revalidate: при сетевой ошибке ветка возвращала undefined,
//     запрос падал, и карточка «Бенчмарк» вечно висела в загрузке.
//   - HTML/navigation → network-first (дашборд всегда обновляется)
//   - shell assets (manifest, icons, ethers.js) → stale-while-revalidate
self.addEventListener('fetch', event => {
  const req = event.request;

  // Не трогаем ничего кроме GET: POST на RPC должен идти мимо кеша всегда.
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  // 1) Всё внешнее, кроме shell-CDN — только сеть, без кеша и без подмены ответа
  const sameOrigin = url.origin === self.location.origin;
  const isShellCdn = SHELL_CROSS_ORIGIN.some(h => url.hostname === h);
  if (!sameOrigin && !isShellCdn) return;   // отдаём браузеру, SW не вмешивается

  // 2) HTML / навигация — network-first
  const isHtml = req.mode === 'navigate' ||
                 req.destination === 'document' ||
                 url.pathname.endsWith('/') ||
                 url.pathname.endsWith('.html');

  if (isHtml) {
    event.respondWith(
      fetch(req).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return response;
      }).catch(() => caches.match(req).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  // 3) Shell-ассеты — stale-while-revalidate, с гарантией непустого ответа
  event.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return response;
      }).catch(() => cached || Response.error());   // никогда не возвращаем undefined
      return cached || fetchPromise;
    })
  );
});
