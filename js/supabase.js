/**
 * POS-KU — Inisialisasi Koneksi Supabase
 * ---------------------------------------------------------------
 * File ini HANYA bertanggung jawab untuk membuat objek koneksi Supabase.
 * Seluruh operasi database ada di file fitur masing-masing
 * (products.js, categories.js, cashier.js, dst).
 *
 * Cara memuat di HTML:
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *   <script src="js/config.js"></script>
 *   <script src="js/localdb.js"></script>
 *   <script src="js/supabase.js"></script>
 *   <script src="js/utils.js"></script>
 *   <script src="js/app.js"></script>
 *
 * PENTING soal nama variabel:
 *   Pustaka @supabase/supabase-js dari CDNictive mendefinisikan global
 *   bernama "supabase" (namespace createClient). Karena itu file ini TIDAK
 *   BOLEH memakai `let supabase = ...` di lingkup script: browser akan
 *   melempar "SyntaxError: Identifier 'supabase' has already been declared".
 *   Klien database disimpan di `dbClient` agar tidak bentrok.
 */

// Pastikan pustaka sudah termuat sebelum file ini dieksekusi.
if (typeof window.supabase === 'undefined') {
  console.error(
    '[POS-KU] Pustaka @supabase/supabase-js tidak termuat. ' +
      'Pastikan tag <script> CDN Supabase berada sebelum js/supabase.js.'
  );
}

/** Klien database aktif (Supabase sungguhan atau LocalDB). */
let dbClient = null;

/**
 * Status koneksi database.
 *
 * - window.isConfigured  : true bila ada sumber data yang siap dipakai.
 *                         Bisa Supabase ATAU LocalDB (mode offline).
 * - window.isOfflineMode : true bila memakai LocalDB (localStorage).
 * - window.SUPABASE_INIT_ERROR : pesan kenapa Supabase tidak bisa dipakai.
 *
 * Modul fitur cukup memeriksa window.isConfigured.
 */
let isConfigured = false;
window.isConfigured = false;
window.isOfflineMode = false;
window.SUPABASE_INIT_ERROR = '';

/**
 * Inisialisasi koneksi database.
 * Urutan: cek config -> Supabase sungguhan -> LocalDB sebagai cadangan.
 */
(function initDatabase() {
  const configCheck = window.validateConfig();

  if (!configCheck.ok) {
    window.SUPABASE_INIT_ERROR = configCheck.error;
    console.warn('[POS-KU] ' + configCheck.error);
  } else if (typeof window.supabase === 'undefined') {
    window.SUPABASE_INIT_ERROR =
      'Pustaka @supabase/supabase-js tidak termuat. Periksa koneksi internet.';
    console.error('[POS-KU] ' + window.SUPABASE_INIT_ERROR);
  } else {
    try {
      dbClient = window.supabase.createClient(
        window.APP_CONFIG.SUPABASE_URL,
        window.APP_CONFIG.SUPABASE_PUBLISHABLE_KEY,
        {
          auth: {
            // MVP single-store tanpa login: tidak ada sesi user yang perlu disimpan.
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
          global: {
            headers: { 'x-client-info': 'pos-ku-umkm/1.0.0' },
          },
        }
      );
      isConfigured = true;
      window.isConfigured = true;
      window.isOfflineMode = false;
      console.log('[POS-KU] Terhubung ke Supabase:', window.APP_CONFIG.SUPABASE_URL);
      return;
    } catch (error) {
      window.SUPABASE_INIT_ERROR = 'Gagal membuat koneksi Supabase: ' + error.message;
      console.error('[POS-KU] ' + window.SUPABASE_INIT_ERROR);
    }
  }

  // ---- MODE OFFLINE (cadangan) ----------------------------------------------
  // Sumber data utama tidak siap, tapi aplikasi tetap harus bisa dipakai & diuji.
  // LocalDB meniru API supabase-js sehingga modul existing tidak berubah.
  if (window.LocalDB) {
    try {
      dbClient = window.LocalDB.createClient();
      isConfigured = true;
      window.isConfigured = true;
      window.isOfflineMode = true;
      console.log('[POS-KU] Mode OFFLINE aktif — data disimpan di localStorage browser.');
      return;
    } catch (error) {
      window.SUPABASE_INIT_ERROR = 'Gagal menyiapkan database lokal: ' + error.message;
      console.error('[POS-KU] ' + window.SUPABASE_INIT_ERROR);
    }
  }

  isConfigured = false;
  window.isConfigured = false;
})();

/**
 * Mengembalikan klien database aktif.
 * Bisa Supabase sungguhan atau LocalDB (mode offline).
 * @returns {object} Objek supabase / LocalDB
 */
function getSupabase() {
  if (!isConfigured || !dbClient) {
    throw new Error(
      window.SUPABASE_INIT_ERROR ||
        'Koneksi database belum siap. Periksa konfigurasi di js/config.js.'
    );
  }
  return dbClient;
}

/** Mengambil detail pesan error Supabase agar enak dibaca manusia. */
function getErrorMessage(error) {
  if (!error) return 'Terjadi kesalahan yang tidak diketahui.';
  if (typeof error === 'string') return error;
  return error.message || 'Terjadi kesalahan pada database.';
}

/** Mengubah error PostgREST menjadi pesan Bahasa Indonesia yang ramah. */
function friendlyError(error) {
  const raw = getErrorMessage(error);

  // Pesan dari Stored Procedure kita sendiri (ditulis dalam Bahasa Indonesia).
  if (/^(Stok produk|Uang pelanggan|Keranjang|Jumlah produk|Produk|Permintaan tidak lengkap)/.test(raw)) {
    return raw;
  }

  // Error umum dari PostgREST / jaringan.
  if (/Failed to fetch|NetworkError|load failed/i.test(raw)) {
    return 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.';
  }
  if (/Could not find the function|schema cache/i.test(raw)) {
    return 'Fungsi database process_checkout belum tersedia. Jalankan supabase/fix_process_checkout.sql di Supabase SQL Editor.';
  }
  if (/duplicate key value violates unique constraint/i.test(raw)) {
    return 'Data sudah ada. Nama tersebut sudah digunakan.';
  }
  if (/violates check constraint/i.test(raw)) {
    return 'Nilai yang dimasukkan tidak valid.';
  }
  if (/violates foreign key constraint/i.test(raw)) {
    return 'Data masih terhubung dengan data lain. Hapus dulu data yang terkait.';
  }
  if (/permission denied|row-level security/i.test(raw)) {
    return 'Akses ke database ditolak. Periksa pengaturan Row Level Security.';
  }

  return raw;
}
