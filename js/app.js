/**
 * POS-KU — Shell Aplikasi
 * ---------------------------------------------------------------
 * Dipakai oleh SEMUA halaman admin. Bertanggung jawab atas:
 *   1. Menyisipkan sidebar + bottom navigation ke dalam halaman
 *   2. Menandai menu aktif sesuai halaman saat ini
 *   3. Mengambil & menyimpan profil toko (store_profile)
 *   4. Prompt instalasi PWA
 *   5. Mendaftarkan Service Worker
 *   6. Menampilkan peringatan bila konfigurasi Supabase belum lengkap
 *
 * File ini TIDAK memuat data tabel apa pun. Data tiap halaman
 * dimuat oleh file fiturnya masing-masing.
 */

/** Definisi menu navigasi (sumber tunggal untuk sidebar & bottom nav). */
const NAV_ITEMS = [
  {
    label: 'Dashboard',
    href: 'dashboard.html',
    icon: 'M2.25 12l8.955-8.955a1.125 1.125 0 011.59 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75',
    showInMobile: true,
  },
  {
    label: 'Kasir',
    href: 'cashier.html',
    icon: 'M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z',
    showInMobile: true,
  },
  {
    label: 'Produk',
    href: 'products.html',
    icon: 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11v6m4-6v6M5.25 7.5h13.5L18 4.5H6l-.75 3z',
    showInMobile: true,
  },
  {
    label: 'Kategori',
    href: 'categories.html',
    icon: 'M6 6.878V6a2.25 2.25 0 012.25-2.25h7.5A2.25 2.25 0 0118 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 004.5 9v.878m13.5-3A2.25 2.25 0 0119.5 9v.878m0 0a2.246 2.246 0 00-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0121 12v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6c0-.98.626-1.813 1.5-2.122',
    showInMobile: false,
  },
  {
    label: 'Riwayat',
    href: 'transactions.html',
    icon: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
    showInMobile: true,
  },
  {
    label: 'Laporan',
    href: 'reports.html',
    icon: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
    showInMobile: false,
  },
  {
    label: 'Katalog',
    href: 'catalog.html',
    icon: 'M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z',
    showInMobile: false,
  },
];

/** Nama halaman saat ini, diambil dari nama file URL. */
function getCurrentPage() {
  const file = window.location.pathname.split('/').pop() || 'index.html';
  return file === '' ? 'index.html' : file;
}

const App = (() => {
  let storeProfile = null;
  let deferredInstallPrompt = null;

  // ==========================================================================
  // SIDEBAR & NAVIGASI
  // ==========================================================================

  /** Membentuk HTML untuk satu item navigasi. */
  function navItemTemplate(item, isActive, variant) {
    const activeClass = isActive ? ' is-active' : '';
    const ariaCurrent = isActive ? ' aria-current="page"' : '';

    if (variant === 'bottom') {
      return `
        <a href="${item.href}" class="bottom-nav-item${activeClass}"${ariaCurrent}>
          <svg class="nav-icon h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.7" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="${item.icon}" />
          </svg>
          <span>${item.label}</span>
        </a>
      `;
    }

    return `
      <a href="${item.href}" class="nav-link${activeClass}"${ariaCurrent}>
        <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke-width="1.7" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="${item.icon}" />
        </svg>
        <span>${item.label}</span>
      </a>
    `;
  }

  /** Menyisipkan sidebar dan bottom navigation ke body halaman. */
  function renderShell() {
    const currentPage = getCurrentPage();
    const isPublicPage = currentPage === 'catalog.html' || currentPage === 'receipt.html';

    // Halaman publik (katalog & struk) tidak memakai sidebar admin.
    if (isPublicPage) return;

    // ---- Sidebar (desktop) -------------------------------------------------
    const sidebar = document.createElement('aside');
    sidebar.id = 'app-sidebar';
    sidebar.className =
      'fixed inset-y-0 left-0 z-50 hidden w-64 flex-col bg-ink-900 lg:flex no-print';
    sidebar.setAttribute('aria-label', 'Navigasi utama');

    sidebar.innerHTML = `
      <!-- Logo -->
      <div class="flex h-16 shrink-0 items-center gap-3 px-5">
        <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 shadow-glow">
          <svg class="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
          </svg>
        </span>
        <div class="min-w-0">
          <p class="truncate text-sm font-bold tracking-tight text-white">POS-KU</p>
          <p class="truncate text-[11px] text-slate-500" data-store-name>Memuat…</p>
        </div>
      </div>

      <!-- Menu -->
      <nav class="flex-1 space-y-1 overflow-y-auto px-3 py-4" data-sidebar-nav></nav>

      <!-- Footer: link katalog + tombol install -->
      <div class="shrink-0 space-y-2 border-t border-white/10 p-3">
        <a href="catalog.html"
           class="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-400
                  transition hover:bg-white/5 hover:text-white">
          <svg class="nav-icon" fill="none" viewBox="0 0 24 24" stroke-width="1.7" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
          <span>Buka Katalog</span>
        </a>
        <button type="button" data-install-app
                class="hidden w-full items-center gap-3 rounded-xl bg-brand-600/15 px-3.5 py-2.5
                       text-sm font-semibold text-brand-300 transition hover:bg-brand-600/25">
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          <span>Install POS-KU</span>
        </button>
      </div>
    `;
    document.body.appendChild(sidebar);

    // Isi menu sidebar
    const sidebarNav = sidebar.querySelector('[data-sidebar-nav]');
    sidebarNav.innerHTML = NAV_ITEMS.map((item) =>
      navItemTemplate(item, item.href === currentPage, 'sidebar')
    ).join('');

    // ---- Topbar (desktop) ---------------------------------------------------
    const topbar = document.createElement('header');
    topbar.className =
      'sticky top-0 z-30 hidden h-16 items-center justify-between border-b border-slate-200 ' +
      'bg-white/85 px-6 backdrop-blur-lg lg:ml-64 lg:flex no-print';
    topbar.innerHTML = `
      <div class="min-w-0">
        <h1 class="truncate text-lg font-bold tracking-tight text-slate-900" data-page-title></h1>
        <p class="truncate text-xs text-slate-500" data-page-subtitle></p>
      </div>
      <div class="flex shrink-0 items-center gap-3">
        <div class="hidden text-right sm:block">
          <p class="text-sm font-semibold text-slate-900" data-clock>--:--:--</p>
          <p class="text-[11px] text-slate-500" data-date></p>
        </div>
        <button type="button" data-install-app-mobile
                class="btn-secondary btn-icon hidden" title="Install POS-KU" aria-label="Install POS-KU">
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
        </button>
        <span class="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800"
              title="Pemilik toko">TB</span>
      </div>
    `;
    document.body.appendChild(topbar);

    // ---- Bottom navigation (mobile) ----------------------------------------
    const mobileItems = NAV_ITEMS.filter((item) => item.showInMobile);
    const bottomNav = document.createElement('nav');
    bottomNav.className = 'bottom-nav no-print';
    bottomNav.setAttribute('aria-label', 'Navigasi cepat');
    bottomNav.innerHTML = mobileItems
      .map((item) => navItemTemplate(item, item.href === currentPage, 'bottom'))
      .join('');
    document.body.appendChild(bottomNav);

    // Beri jarak bawah agar konten tidak tertutup bottom nav.
    const main = document.querySelector('main');
    if (main) main.classList.add('pb-24', 'lg:pb-8');

    // Judul halaman otomatis dari item navigasi.
    const activeItem = NAV_ITEMS.find((item) => item.href === currentPage);
    if (activeItem) {
      const titleEl = topbar.querySelector('[data-page-title]');
      if (titleEl) titleEl.textContent = activeItem.label;
      const subtitleEl = topbar.querySelector('[data-page-subtitle]');
      if (subtitleEl) subtitleEl.textContent = window.APP_CONFIG.STORE.tagline || '';
    }

    startClock();
  }

  /** Mengubah elemen agar kontennya dimulai setelah sidebar (desktop). */
  function applyLayoutOffset() {
    const main = document.querySelector('main');
    if (main) main.classList.add('lg:ml-64');
  }

  // ==========================================================================
  // JAM & TANGGAL
  // ==========================================================================

  function startClock() {
    const clockEl = document.querySelector('[data-clock]');
    const dateEl = document.querySelector('[data-date]');
    if (!clockEl && !dateEl) return;

    const tz = window.APP_CONFIG.TIMEZONE || 'Asia/Jakarta';

    const tick = () => {
      const now = new Date();
      if (clockEl) {
        clockEl.textContent = new Intl.DateTimeFormat('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZone: tz,
        }).format(now);
      }
      if (dateEl) {
        dateEl.textContent = new Intl.DateTimeFormat('id-ID', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: tz,
        }).format(now);
      }
    };

    tick();
    setInterval(tick, 1000);
  }

  // ==========================================================================
  // PROFIL TOKO
  // ==========================================================================

  /**
   * Mengambil profil toko dari database.
   * Nilai dari config.js dipakai sebagai cadangan bila database belum diisi
   * atau terjadi kesalahan.
   * @returns {Promise<object>}
   */
  async function loadStoreProfile() {
    const fallback = {
      store_name: window.APP_CONFIG.STORE.name,
      tagline: window.APP_CONFIG.STORE.tagline,
      whatsapp_number: window.APP_CONFIG.STORE.whatsapp,
      address: window.APP_CONFIG.STORE.address,
    };

    if (!window.isConfigured) {
      storeProfile = fallback;
      applyStoreProfile();
      return storeProfile;
    }

    try {
      const { data, error } = await getSupabase()
        .from('store_profile')
        .select('store_name, tagline, whatsapp_number, address')
        .eq('id', 1)
        .maybeSingle();

      if (error) throw error;

      storeProfile = data || fallback;
    } catch (error) {
      console.warn('[POS-KU] Gagal memuat profil toko, memakai nilai bawaan:', error);
      storeProfile = fallback;
    }

    applyStoreProfile();
    return storeProfile;
  }

  /** Menuliskan nama toko ke seluruh elemen yang membutuhkan. */
  function applyStoreProfile() {
    if (!storeProfile) return;

    document.querySelectorAll('[data-store-name]').forEach((el) => {
      el.textContent = storeProfile.store_name || window.APP_CONFIG.STORE.name;
    });
    document.title = document.title.replace(
      /POS-KU/,
      storeProfile.store_name || 'POS-KU'
    );
  }

  // ==========================================================================
  // PWA
  // ==========================================================================

  /** Menangkap event install dari browser lalu menampilkan tombol Install. */
  function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (event) => {
      // Cegah dialog bawaan browser, kita tampilkan tombol sendiri.
      event.preventDefault();
      deferredInstallPrompt = event;

      document.querySelectorAll('[data-install-app], [data-install-app-mobile]').forEach((btn) => {
        btn.classList.remove('hidden');
      });
    });

    document.querySelectorAll('[data-install-app], [data-install-app-mobile]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!deferredInstallPrompt) {
          Utils.showToast(
            'Fitur install tidak tersedia di browser ini. ' +
              'Gunakan Chrome atau Edge di komputer, atau Chrome di Android.',
            'info'
          );
          return;
        }
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          Utils.showToast('POS-KU berhasil diinstal.', 'success');
        }
        deferredInstallPrompt = null;
        document.querySelectorAll('[data-install-app], [data-install-app-mobile]').forEach((b) =>
          b.classList.add('hidden')
        );
      });
    });

    // Jika aplikasi sudah terinstal, sembunyikan tombol install.
    if (window.matchMedia('(display-mode: standalone)').matches) {
      document.querySelectorAll('[data-install-app], [data-install-app-mobile]').forEach((b) =>
        b.classList.add('hidden')
      );
    }
  }

  /** Mendaftarkan Service Worker agar aplikasi bisa di-install (PWA). */
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('sw.js')
        .then((registration) => {
          console.log('[POS-KU] Service Worker aktif:', registration.scope);
        })
        .catch((error) => {
          console.warn('[POS-KU] Service Worker gagal didaftarkan:', error);
        });
    });
  }

  // ==========================================================================
  // KONFIGURASI BELUM LENGKAP
  // ==========================================================================

  /**
   * Menampilkan banner sesuai status koneksi:
   *   - Mode offline (LocalDB): info biru, aplikasi tetap berfungsi penuh.
   *   - Konfigurasi Supabase belum lengkap dan LocalDB tidak tersedia: peringatan amber.
   */
  function showConfigWarning() {
    const offline = window.isOfflineMode === true;
    const configured = window.isConfigured === true;

    if (configured && !offline) return; // Supabase asli siap — tidak perlu banner.

    if (offline) {
      const banner = document.createElement('div');
      banner.id = 'offline-banner';
      banner.className =
        'no-print mb-6 rounded-2xl border-2 border-brand-300 bg-brand-50 p-4 shadow-sm animate-fade-in';
      banner.innerHTML = `
        <div class="flex items-start gap-3">
          <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke-width="1.9" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.922-3.422a4.5 4.5 0 00-6.364 0l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
            </svg>
          </span>
          <div class="flex-1">
            <h2 class="text-sm font-bold text-brand-900">Mode Offline — Data Demo</h2>
            <p class="mt-0.5 text-xs leading-relaxed text-brand-800">
              Supabase belum dikonfigurasi, sehingga POS-KU bekerja dengan
              <strong>database lokal (browser)</strong> berisi data demo.
              Semua fitur (kasir, stok, struk, laporan) berjalan normal.
              Untuk memakai data asli, isi Publishable key di
              <code class="rounded bg-brand-100 px-1.5 py-0.5 font-mono text-[11px]">js/config.js</code>
              lalu muat ulang halaman.
            </p>
          </div>
        </div>
      `;

      const main = document.querySelector('main');
      if (main) main.insertBefore(banner, main.firstChild);
      return;
    }

    // Tidak ada sumber data sama sekali — tetap tampilkan peringatan besar.
    const banner = document.createElement('div');
    banner.id = 'config-warning';
    banner.className =
      'no-print mb-6 rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 shadow-sm animate-fade-in';
    banner.innerHTML = `
      <div class="flex items-start gap-4">
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">
          <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.9" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126Z" />
          </svg>
        </span>
        <div class="flex-1">
          <h2 class="text-base font-bold text-amber-900">Konfigurasi Supabase belum lengkap</h2>
          <p class="mt-1 text-sm leading-relaxed text-amber-800">
            ${Utils.escapeHtml(window.SUPABASE_INIT_ERROR || 'Publishable key belum diisi.')}
          </p>
          <ol class="mt-3 space-y-1.5 text-sm text-amber-900">
            <li class="flex gap-2"><span class="font-bold">1.</span>
              <span>Buka file <code class="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs">js/config.js</code></span>
            </li>
            <li class="flex gap-2"><span class="font-bold">2.</span>
              <span>Salin <strong>Publishable key</strong> dari Supabase Dashboard &rarr; Project Settings &rarr; API</span>
            </li>
            <li class="flex gap-2"><span class="font-bold">3.</span>
              <span>Tempel ke <code class="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs">SUPABASE_PUBLISHABLE_KEY</code>, lalu muat ulang halaman</span>
            </li>
            <li class="flex gap-2"><span class="font-bold">4.</span>
              <span>Pastikan <code class="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs">supabase/schema.sql</code> sudah dijalankan</span>
            </li>
          </ol>
        </div>
      </div>
    `;

    const main = document.querySelector('main');
    if (main) main.insertBefore(banner, main.firstChild);
  }

  // ==========================================================================
  // INISIALISASI
  // ==========================================================================

  function init() {
    renderShell();
    applyLayoutOffset();
    setupInstallPrompt();
    registerServiceWorker();
    showConfigWarning();
    loadStoreProfile();
  }

  // Jalankan setelah DOM siap (script berada di akhir body).
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    get storeProfile() {
      return storeProfile;
    },
    loadStoreProfile,
    init,
  };
})();
