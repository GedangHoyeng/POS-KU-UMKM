/**
 * POS-KU Service Worker
 * ---------------------------------------------------------------
 * STRATEGI CACHING (sudah diperbaiki)
 *
 * 1. Navigasi halaman (.html)  -> NETWORK-FIRST
 *    Selalu coba ambil dari server lebih dulu. Bila online, user
 *    selalu mendapat versi terbaru tanpa perlu Ctrl+Shift+R.
 *    Cache hanya dipakai saat offline.
 *
 * 2. Aset statis (JS/CSS/gambar) -> STALE-WHILE-REVALIDATE
 *    Dilayani dari cache supaya cepat, lalu diam-diam diperbarui
 *    di background untuk kunjungan berikutnya.
 *
 * 3. Request Supabase / external -> TIDAK PERNAH di-cache
 *    Data harus selalu segar.
 *
 * MASALAH YANG SUDAH DIPERBAIKI:
 *   Sebelumnya semua request memakai cache-first murni. Akibatnya
 *   products.html (dan halaman lain) dilayani dari cache selamanya
 *   sehingga perubahan baru tidak pernah terlihat sampai pengguna
 *   melakukan hard reload.
 *
 * CACHE_NAME di-bump satu kali (posku-v2 -> posku-v3) untuk
 * membersihkan entry basi yang sudah tersimpan di perangkat.
 *她了 Setelah itu, bumping versi tidak lagi diperlukan setiap
 * kali HTML berubah karena navigasi memakai network-first.
 */

const CACHE_NAME = 'posku-v3';

// Shell aplikasi yang selalu tersedia untuk offline.
const PRECACHE_URLS = ['/', '/index.html'];

// Aset statis: pakai stale-while-revalidate (cepat + selalu segar).
const STATIC_ASSET_PATTERN = /\.(?:js|css|png|jpg|jpeg|webp|svg|ico|woff2?|woff|ttf)$/i;

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

  // Hanya tangani GET. POST/PATCH/DELETE ke Supabase harus langsung.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 1) Data Supabase & origin lain: selalu ke network, tidak pernah cache.
  if (url.origin !== self.location.origin) {
    event.respondWith(fetch(request));
    return;
  }

  // 2) Navigasi halaman: NETWORK-FIRST.
  //    Ini yang membuat produk.html versi baru langsung terlihat
  //    tanpa perlu hard reload.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          // Offline: pakai halaman yang tersimpan, lalu fallback ke shell.
          caches
            .match(request)
            .then((cached) => cached || caches.match('/index.html'))
        )
    );
    return;
  }

  // 3) Aset statis: STALE-WHILE-REVALIDATE.
  //    Cache hanya dibaca dari CACHE_NAME agar tidak salah ambil
  //    entry basi milik versi lama.
  if (STATIC_ASSET_PATTERN.test(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);

        const network = fetch(request)
          .then((response) => {
            if (response && response.status === 200 && response.type === 'basic') {
              const copy = response.clone();
              cache.put(request, copy);
            }
            return response;
          })
          .catch(() => null);

        // Sajikan cache bila ada, perbarui diam-diam di background.
        return cached || (await network) || Response.error();
      })
    );
    return;
  }

  // 4) Sisanya: network-first tanpa menyimpan.
  event.respondWith(fetch(request));
});
