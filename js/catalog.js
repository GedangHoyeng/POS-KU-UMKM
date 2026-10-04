/**
 * POS-KU — Katalog Publik (catalog.js)
 * ---------------------------------------------------------------
 * Tanggung jawab:
 *   1. Memuat produk aktif + kategori dari database
 *   2. Pencarian & filter kategori (chip + dropdown)
 *   3. Menampilkan kartu produk: gambar, nama, harga, status stok
 *   4. Menampilkan identitas toko di header & footer
 *
 * Halaman ini面向 pelanggan (publik) — TIDAK memakai sidebar admin.
 */

const Catalog = (() => {
  /** @type {Array<object>} */ let allProducts = [];
  /** @type {Array<object>} */ let allCategories = [];
  /** @type {object|null} */ let storeProfile = null;

  let searchQuery = '';
  let activeCategoryId = null;

  let els = {};

  // ==========================================================================
  // MEMUAT DATA
  // ==========================================================================

  async function loadData() {
    const [prodRes, catRes] = await Promise.all([
      getSupabase()
        .from('products')
        .select('id, name, description, price, stock, image_url, category_id')
        .eq('is_active', true)
        .order('name'),
      getSupabase().from('categories').select('id, name').order('name'),
    ]);

    if (prodRes.error) console.warn('[POS-KU] Gagal muat produk:', prodRes.error);
    if (catRes.error) console.warn('[POS-KU] Gagal muat kategori:', catRes.error);

    allProducts = prodRes.data || [];
    allCategories = catRes.data || [];

    // Profil toko.
    const profileRes = await getSupabase()
      .from('store_profile')
      .select('store_name, tagline, address')
      .eq('id', 1)
      .maybeSingle();

    const fallback = window.APP_CONFIG.STORE;
    storeProfile = profileRes.data || {
      store_name: fallback.name,
      tagline: fallback.tagline,
      address: fallback.address,
    };
  }

  // ==========================================================================
  // RENDER
  // ==========================================================================

  function getFiltered() {
    const query = searchQuery.trim().toLowerCase();

    return allProducts.filter((p) => {
      if (activeCategoryId !== null && p.category_id !== activeCategoryId) return false;
      if (query && !String(p.name).toLowerCase().includes(query)) return false;
      return true;
    });
  }

  function renderProducts() {
    const products = getFiltered();

    if (products.length === 0) {
      els.grid.innerHTML = '';
      els.empty.classList.remove('hidden');
      return;
    }

    els.empty.classList.add('hidden');

    els.grid.innerHTML = products.map(cardTemplate).join('');
  }

  function cardTemplate(product) {
    const isOut = product.stock <= 0;
    const threshold = window.APP_CONFIG?.LOW_STOCK_THRESHOLD ?? 5;

    let stockBadge;
    if (isOut) {
      stockBadge = '<span class="badge-danger">Stok Habis</span>';
    } else if (product.stock <= threshold) {
      stockBadge = `<span class="badge-warning">Sisa ${product.stock}</span>`;
    } else {
      stockBadge = '<span class="badge-success">Tersedia</span>';
    }

    const category = allCategories.find((c) => c.id === product.category_id);
    const imageUrl = Utils.safeImageUrl(product.image_url);
    const initial = Utils.escapeHtml(String(product.name || '?').charAt(0).toUpperCase());

    const imageHtml = imageUrl
      ? `<img src="${Utils.escapeHtml(imageUrl)}" alt="${Utils.escapeHtml(product.name)}"
               class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
               loading="lazy" onerror="this.parentElement.classList.add('bg-slate-100'); this.remove();" />`
      : `<div class="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-50 to-brand-100">
           <span class="select-none text-4xl font-extrabold text-brand-300">${initial}</span>
         </div>`;

    return `
      <article class="card card-hover group flex flex-col overflow-hidden ${isOut ? 'opacity-70' : ''}">
        <div class="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
          ${imageHtml}
          <div class="absolute left-2 top-2">${stockBadge}</div>
        </div>
        <div class="flex flex-1 flex-col p-3">
          ${category
            ? `<p class="mb-1 text-[10px] font-semibold uppercase tracking-wide text-brand-600">${Utils.escapeHtml(
                category.name
              )}</p>`
            : ''}
          <h3 class="line-clamp-2 text-sm font-bold leading-snug text-slate-900" title="${Utils.escapeHtml(
            product.name
          )}">${Utils.escapeHtml(product.name)}</h3>
          <p class="mt-1.5 text-base font-extrabold tabular text-brand-700">${Utils.formatRupiah(
            product.price
          )}</p>
          ${product.description
            ? `<p class="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-500">${Utils.escapeHtml(
                product.description
              )}</p>`
            : ''}
        </div>
      </article>`;
  }

  function renderChips() {
    const allChip = `
      <button type="button"
              class="shrink-0 whitespace-nowrap rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
                activeCategoryId === null
                  ? 'border-brand-700 bg-brand-700 text-white shadow-sm'
                  : 'border-slate-300 bg-white text-slate-600 hover:border-brand-400 hover:text-brand-700'
              }"
              data-action="filter-category" data-id="">
        Semua
      </button>`;

    const chips = allCategories
      .map((cat) => {
        const active = activeCategoryId === cat.id;
        return `
          <button type="button"
                  class="shrink-0 whitespace-nowrap rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
                    active
                      ? 'border-brand-700 bg-brand-700 text-white shadow-sm'
                      : 'border-slate-300 bg-white text-slate-600 hover:border-brand-400 hover:text-brand-700'
                  }"
                  data-action="filter-category" data-id="${cat.id}">
            ${Utils.escapeHtml(cat.name)}
          </button>`;
      })
      .join('');

    els.chips.innerHTML = allChip + chips;
  }

  function renderFilterOptions() {
    els.filter.innerHTML =
      '<option value="">Semua kategori</option>' +
      allCategories
        .map((c) => `<option value="${c.id}">${Utils.escapeHtml(c.name)}</option>`)
        .join('');
  }

  function renderStoreInfo() {
    if (!storeProfile) return;

    setText('catalog-store-name', storeProfile.store_name || 'Katalog Toko');
    setText('catalog-store-tagline', storeProfile.tagline || '');
    setText('catalog-footer-name', storeProfile.store_name || 'Toko Kami');
    setText('catalog-footer-tagline', storeProfile.tagline || '');
    setText('catalog-footer-address', storeProfile.address || '');

    document.title = `Katalog ${storeProfile.store_name || 'Toko'} — POS-KU`;
  }

  // ==========================================================================
  // EVENT
  // ==========================================================================

  function bindEvents() {
    els.search.addEventListener(
      'input',
      Utils.debounce((event) => {
        searchQuery = event.target.value;
        renderProducts();
      }, 200)
    );

    els.filter.addEventListener('change', (event) => {
      activeCategoryId = event.target.value ? Number(event.target.value) : null;
      renderChips();
      renderProducts();
    });

    els.chips.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-action="filter-category"]');
      if (!chip) return;
      activeCategoryId = chip.dataset.id ? Number(chip.dataset.id) : null;
      els.filter.value = activeCategoryId === null ? '' : String(activeCategoryId);
      renderChips();
      renderProducts();
    });
  }

  // ==========================================================================
  // UTILS
  // ==========================================================================

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  // ==========================================================================
  // INIT
  // ==========================================================================

  function cacheElements() {
    els = {
      grid: document.getElementById('catalog-grid'),
      empty: document.getElementById('catalog-empty'),
      loading: document.getElementById('catalog-loading'),
      chips: document.getElementById('catalog-chips'),
      filter: document.getElementById('catalog-filter'),
      search: document.getElementById('catalog-search'),
    };
  }

  async function init() {
    cacheElements();
    bindEvents();
    await loadData();

    els.loading.classList.add('hidden');
    renderStoreInfo();
    renderFilterOptions();
    renderChips();
    renderProducts();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init };
})();
