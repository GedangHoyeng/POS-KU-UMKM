/**
 * POS-KU Service Worker
 * ---------------------------------------------------------------
 * Strategi: cache-first untuk asset statis, network-first untuk
 * data Supabase (selalu lewat fetch, tidak pernah di-cache).
 *
 * CACHE_NAME di-bump setiap kali ada perubahan asset penting
 * (HTML/CSS/JS). Saat activate, semua cache versi lama dihapus
 * agar tidak ada asset stale yang tersisa di perangkat pengguna.
 */

const CACHE_NAME = 'posku-v2';

// Asset yang boleh di-cache (shell aplikasi + aset statis).
const PRECACHE_URLS = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Jangan pernah cache request Supabase (data harus selalu segar).
  if (request.url.includes('supabase.co')) {
    event.respondWith(fetch(request));
    return;
  }

  // Cache-first untuk asset statis; fallback ke network lalu cache.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request)
          .then((response) => {
            // Hanya cache response OK dan same-origin / CDN yang stabil.
            if (response && response.status === 200 && response.type === 'basic') {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => {
            // Offline fallback untuk navigasi.
            if (request.mode === 'navigate') {
              return caches.match('/index.html');
            }
            return Response.error();
          })
    )
  );
});
