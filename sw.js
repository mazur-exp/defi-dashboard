const CACHE_NAME = 'defi-cgs-v3';
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/ethers/5.7.2/ethers.umd.min.js'
];

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
//   - API calls (RPC, DeFi Llama, Pendle, CoinGecko, etc.) → network-only
//   - HTML/index/root navigation → network-first (always try fresh, fall back to cache offline)
//   - Other shell assets (manifest, icons, ethers.js) → stale-while-revalidate (instant, refresh in bg)
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // 1) API calls — always network, no cache fallback
  if (url.hostname.includes('publicnode.com') ||
      url.hostname.includes('arbitrum.io') ||
      url.hostname.includes('llamarpc.com') ||
      url.hostname.includes('llama.fi') ||
      url.hostname.includes('defillama.com') ||
      url.hostname.includes('pendle.finance') ||
      url.hostname.includes('coingecko.com') ||
      url.hostname.includes('cryptocompare.com') ||
      url.hostname.includes('mempool.space') ||
      url.hostname.includes('blockchain.info') ||
      url.hostname.includes('gmx.io') ||
      url.hostname.includes('gmxinfra.io') ||
      url.hostname.includes('drpc.org') ||
      url.hostname.includes('1rpc.io')) {
    event.respondWith(fetch(req));
    return;
  }

  // 2) HTML / navigation — network-first (so dashboard updates always reach the client)
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

  // 3) Other shell assets — stale-while-revalidate
  event.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
