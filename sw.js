const CACHE_NAME = 'defi-cgs-v1';
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

// Fetch — network-first for API calls, cache-first for shell
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API calls (RPC, DeFi Llama, Pendle, CoinGecko) — always network
  if (url.hostname.includes('publicnode.com') ||
      url.hostname.includes('arbitrum.io') ||
      url.hostname.includes('llamarpc.com') ||
      url.hostname.includes('llama.fi') ||
      url.hostname.includes('defillama.com') ||
      url.hostname.includes('pendle.finance') ||
      url.hostname.includes('coingecko.com') ||
      url.hostname.includes('blockchain.info') ||
      url.hostname.includes('gmx.io')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // App shell — cache-first, fallback to network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache successful responses
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
