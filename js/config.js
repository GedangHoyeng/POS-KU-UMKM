/**
 * POS-KU — Konfigurasi Aplikasi
 * ---------------------------------------------------------------
 * File ini adalah SATU-SATUNYA tempat untuk mengubah konfigurasi aplikasi.
 *
 * CARA MENGISI KUNCI SUPABASE:
 *   1. Buka Supabase Dashboard > Project Settings > API
 *   2. Salin "Publishable key" (formatnya diawali "sb_publishable_")
 *   3. Tempel ke SUPABASE_PUBLISHABLE_KEY di bawah, TANPA tanda kutip tambahan.
 *
 * KEAMANAN:
 *   - Publishable/anon key AMAN untuk frontend (tetap terbatas oleh aturan RLS).
 *   - JANGAN PERNAH memakai "service_role key" di sini. Key tersebut
 *     melewati semua aturan RLS dan hanya boleh dipakai di server.
 */
window.APP_CONFIG = {
  // --- Supabase -----------------------------------------------------------
  SUPABASE_URL: 'https://mlfrezwrsdhemcilmovz.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_dDijDRhkxjQbJmJ8nchujg_E_7DGqd7',

  // --- Identitas toko (single store) --------------------------------------
  // Nilai ini hanya dipakai sebagai FALLBACK. Sumber kebenaran sebenarnya
  // adalah tabel "store_profile" di database.
  STORE: {
    name: 'Toko Berkah Bersama',
    tagline: 'Sembako, makanan, dan kerajinan lokal',
    whatsapp: '6285723052692',
    address: 'Jl. Merdeka No. 10, Indonesia',
  },

  // --- Zona waktu ---------------------------------------------------------
  // Digunakan agar "hari ini" sesuai waktu Indonesia, bukan waktu komputer.
  TIMEZONE: 'Asia/Jakarta',

  // --- Angka ----------------------------------------------------------
  LOW_STOCK_THRESHOLD: 5, // Stok <= nilai ini ditandai "menipis"
  CURRENCY: 'Rp',
};

/**
 * Mengembalikan konfigurasi yang sudah tervalidasi.
 * Dipanggil oleh supabase.js sebelum koneksi dibuat.
 * @returns {{ok: boolean, error?: string}}
 */
window.validateConfig = function validateConfig() {
  const url = (window.APP_CONFIG.SUPABASE_URL || '').trim();
  const key = (window.APP_CONFIG.SUPABASE_PUBLISHABLE_KEY || '').trim();

  if (!url || url.includes('YOUR_') || url === 'GANTI_DENGAN_SUPABASE_URL') {
    return { ok: false, error: 'SUPABASE_URL belum diisi di js/config.js.' };
  }
  if (!key || key.includes('YOUR_') || key.startsWith('GANTI_DENGAN')) {
    return {
      ok: false,
      error:
        'SUPABASE_PUBLISHABLE_KEY belum diisi di js/config.js. ' +
        'Salin Publishable key dari Supabase Dashboard > Project Settings > API.',
    };
  }
  return { ok: true };
};
