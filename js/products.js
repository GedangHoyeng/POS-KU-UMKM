/**
 * POS-KU — Kelola Produk
 * ---------------------------------------------------------------
 * Tanggung jawab file ini:
 *   1. Memuat seluruh produk (aktif & nonaktif) + kategori
 *   2. Pencarian, filter kategori, filter status
 *   3. Menambah / mengubah produk lewat modal form
 *   4. Menghapus produk (dengan konfirmasi)
 *   5. Menampilkan ringkasan: total, aktif, stok menipis, habis
 *
 * Catatan: kolom `name` unik di database. Bila nama sudah dipakai,
 * pesan error dari server diterjemahkan lewat friendlyError().
 */

const Products = (() => {
  // ==========================================================================
  // STATE
  // ==========================================================================

  /** @type {Array<object>} seluruh produk dari database */
  let allProducts = [];
  /** @type {Array<object>} seluruh kategori dari database */
  let allCategories = [];

  let searchQuery = '';
  let filterCategory = '';
  let filterStatus = '';

  /** Id produk yang sedang diedit. null = mode tambah. */
  let editingId = null;

  /** Elemen DOM (diisi saat init). */
  let els = {};

  // ==========================================================================
  // MEMUAT DATA
  // ==========================================================================

  async function loadProducts() {
    els.loading.classList.remove('hidden');

    if (!window.isConfigured) {
      els.loading.classList.add('hidden');
      renderTable();
      return;
    }

    const { data, error } = await getSupabase()
      .from('products')
      .select('id, name, description, price, stock, image_url, is_active, category_id, created_at')
      .order('name');

    els.loading.classList.add('hidden');

    if (error) {
      Utils.showToast(friendlyError(error), 'error');
      renderTable();
      return;
    }

    allProducts = data || [];
    renderTable();
  }

  async function loadCategories() {
    if (!window.isConfigured) return;

    const { data, error } = await getSupabase()
      .from('categories')
      .select('id, name')
      .order('name');

    if (error) {
      console.warn('[POS-KU] Gagal memuat kategori:', error);
      return;
    }

    allCategories = data || [];
    renderCategoryOptions();
  }

  // ==========================================================================
  // FILTER & RENDER TABEL
  // ==========================================================================

  /** Produk yang cocok dengan pencarian dan filter aktif. */
  function getFiltered() {
    const query = searchQuery.trim().toLowerCase();

    return allProducts.filter((product) => {
      if (query && !String(product.name).toLowerCase().includes(query)) return false;

      if (filterCategory !== '') {
        const id = Number(filterCategory);
        if (product.category_id !== id) return false;
      }

      if (filterStatus === 'active' && product.is_active !== true) return false;
      if (filterStatus === 'inactive' && product.is_active !== false) return false;

      return true;
    });
  }

  function renderTable() {
    renderStats();

    const products = getFiltered();
    const isFiltered =
      searchQuery.trim() !== '' || filterCategory !== '' || filterStatus !== '';

    // Tampilkan empty state hanya saat benar-benar tidak ada data sama sekali.
    // Kalau data ada tapi filter tidak cocok, tampilkan pesan "tidak ditemukan".
    if (allProducts.length === 0) {
      els.tableBody.innerHTML = '';
      els.emptyTitle.textContent = 'Belum ada produk';
      els.emptyText.textContent = 'Tambahkan produk pertama toko Anda untuk mulai berjualan.';
      els.empty.classList.remove('hidden');
      return;
    }

    els.empty.classList.add('hidden');

    if (products.length === 0) {
      els.tableBody.innerHTML = `
        <tr>
          <td colspan="6">
            <div class="empty-state py-12">
              <span class="empty-icon">
                <svg class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke-width="1.6" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607Z" />
                </svg>
              </span>
              <h3 class="text-base font-bold text-slate-900">Produk tidak ditemukan</h3>
              <p class="mt-1.5 max-w-xs text-sm text-slate-600">
                ${isFiltered
                  ? 'Tidak ada produk yang cocok dengan pencarian atau filter ini.'
                  : 'Belum ada produk.'}
              </p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    els.tableBody.innerHTML = products.map(rowTemplate).join('');
  }

  function rowTemplate(product) {
    const category = allCategories.find((c) => c.id === product.category_id);
    const threshold = window.APP_CONFIG.LOW_STOCK_THRESHOLD;

    let stockBadge;
    if (product.stock <= 0) {
      stockBadge = '<span class="badge-danger">Habis</span>';
    } else if (product.stock <= threshold) {
      stockBadge = `<span class="badge-warning">${product.stock}</span>`;
    } else {
      stockBadge = `<span class="badge-success">${product.stock}</span>`;
    }

    // Badge status bisa diklik untuk menonaktifkan/mengaktifkan produk
    // tanpa harus membuka modal ubah.
    const statusBadge = product.is_active
      ? `<button type="button" class="badge-brand hover:ring-brand-600/40" data-action="toggle" data-id="${product.id}"
                title="Klik untuk menonaktifkan" aria-label="Nonaktifkan ${Utils.escapeHtml(product.name)}">Aktif</button>`
      : `<button type="button" class="badge-neutral hover:ring-slate-500/40" data-action="toggle" data-id="${product.id}"
                title="Klik untuk mengaktifkan" aria-label="Aktifkan ${Utils.escapeHtml(product.name)}">Nonaktif</button>`;

    const imageUrl = Utils.safeImageUrl(product.image_url);
    const thumb = imageUrl
      ? `<img src="${Utils.escapeHtml(imageUrl)}" alt=""
              class="h-11 w-11 rounded-lg object-cover" loading="lazy"
              onerror="this.parentElement.textContent='?'; this.remove();" />`
      : `<div class="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-base font-extrabold text-brand-400">
           ${Utils.escapeHtml(String(product.name || '?').charAt(0).toUpperCase())}
         </div>`;

    return `
      <tr data-id="${product.id}">
        <td>
          <div class="flex items-center gap-3">
            ${thumb}
            <div class="min-w-0">
              <p class="truncate font-semibold text-slate-900" title="${Utils.escapeHtml(product.name)}">
                ${Utils.escapeHtml(product.name)}
              </p>
              ${product.description
                ? `<p class="mt-0.5 max-w-xs truncate text-xs text-slate-500">${Utils.escapeHtml(product.description)}</p>`
                : ''}
            </div>
          </div>
        </td>
        <td class="text-slate-600">${category ? Utils.escapeHtml(category.name) : '<span class="text-slate-400">—</span>'}</td>
        <td class="text-right font-bold tabular text-slate-900">${Utils.formatRupiah(product.price)}</td>
        <td class="text-center">${stockBadge}</td>
        <td class="text-center">${statusBadge}</td>
        <td>
          <div class="flex justify-end gap-1">
            <button type="button" class="btn-ghost btn-icon" data-action="edit" data-id="${product.id}"
                    title="Ubah produk" aria-label="Ubah ${Utils.escapeHtml(product.name)}">
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="1.9" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
              </svg>
            </button>
            <button type="button" class="btn-ghost btn-icon hover:bg-rose-50 hover:text-rose-600"
                    data-action="delete" data-id="${product.id}"
                    title="Hapus produk" aria-label="Hapus ${Utils.escapeHtml(product.name)}">
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="1.9" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  function renderStats() {
    const threshold = window.APP_CONFIG.LOW_STOCK_THRESHOLD;
    const active = allProducts.filter((p) => p.is_active).length;
    const low = allProducts.filter((p) => p.stock > 0 && p.stock <= threshold).length;
    const out = allProducts.filter((p) => p.stock <= 0).length;

    els.statTotal.textContent = allProducts.length;
    els.statActive.textContent = active;
    els.statLow.textContent = low;
    els.statOut.textContent = out;
  }

  // ==========================================================================
  // KATEGORI (dropdown filter & form)
  // ==========================================================================

  function renderCategoryOptions() {
    const filterHtml =
      '<option value="">Semua kategori</option>' +
      allCategories
        .map((c) => `<option value="${c.id}">${Utils.escapeHtml(c.name)}</option>`)
        .join('');
    els.filterCategory.innerHTML = filterHtml;

    const formHtml =
      '<option value="">— Tanpa kategori —</option>' +
      allCategories
        .map((c) => `<option value="${c.id}">${Utils.escapeHtml(c.name)}</option>`)
        .join('');
    els.formCategory.innerHTML = formHtml;
  }

  // ==========================================================================
  // MODAL FORM
  // ==========================================================================

  function openForm(product) {
    editingId = product ? product.id : null;

    els.modalTitle.textContent = product ? 'Ubah Produk' : 'Tambah Produk';
    els.saveLabel.textContent = product ? 'Simpan Perubahan' : 'Simpan Produk';

    els.form.reset();
    Utils.resetValidation(els.form);

    if (product) {
      els.formName.value = product.name || '';
      els.formCategory.value = product.category_id ? String(product.category_id) : '';
      els.formPrice.value = Number(product.price) || 0;
      els.formStock.value = product.stock ?? 0;
      els.formImage.value = product.image_url || '';
      els.formDescription.value = product.description || '';
      els.formActive.checked = product.is_active !== false;
    } else {
      els.formPrice.value = '';
      els.formStock.value = '';
      els.formActive.checked = true;
    }

    updateImagePreview();
    Utils.openModal(els.modal);
  }

  function closeForm() {
    Utils.closeModal(els.modal);
    editingId = null;
    els.form.reset();
    Utils.resetValidation(els.form);
  }

  // ==========================================================================
  // SIMPAN (INSERT / UPDATE)
  // ==========================================================================

  async function handleSubmit(event) {
    event.preventDefault();

    // Hapus tanda error dari percobaan sebelumnya.
    Utils.resetValidation(els.form);

    const name = els.formName.value.trim();
    const price = Number(els.formPrice.value);
    const stock = Number(els.formStock.value);
    const categoryId = els.formCategory.value ? Number(els.formCategory.value) : null;
    const imageUrl = els.formImage.value.trim();
    const description = els.formDescription.value.trim();
    const isActive = els.formActive.checked;

    // --- Validasi manual di luar aturan Utils (agar pesan lebih spesifik) --
    if (name === '') {
      showFieldError(els.formName, 'Nama produk wajib diisi.');
      els.formName.focus();
      return;
    }
    if (els.formPrice.value === '' || Number.isNaN(price) || price < 0) {
      showFieldError(els.formPrice, 'Harga harus berupa angka dan tidak boleh negatif.');
      els.formPrice.focus();
      return;
    }
    if (els.formStock.value === '' || Number.isNaN(stock) || stock < 0 || !Number.isInteger(stock)) {
      showFieldError(els.formStock, 'Stok harus berupa bilangan bulat dan tidak boleh negatif.');
      els.formStock.focus();
      return;
    }

    const payload = {
      name,
      price,
      stock,
      category_id: categoryId,
      image_url: imageUrl === '' ? null : imageUrl,
      description: description === '' ? null : description,
      is_active: isActive,
    };

    if (!window.isConfigured) {
      Utils.showToast(window.SUPABASE_INIT_ERROR, 'error');
      return;
    }

    setSaving(true);

    try {
      if (editingId) {
        const { error } = await getSupabase()
          .from('products')
          .update(payload)
          .eq('id', editingId);
        if (error) throw error;
        Utils.showToast('Produk berhasil diperbarui.', 'success');
      } else {
        const { error } = await getSupabase().from('products').insert(payload);
        if (error) throw error;
        Utils.showToast('Produk berhasil ditambahkan.', 'success');
      }

      closeForm();
      await loadProducts();
    } catch (error) {
      const message = friendlyError(error);

      // Nama produk unik -> tunjukkan error tepat di kolom nama.
      if (/sudah ada|unique/i.test(message)) {
        showFieldError(els.formName, 'Nama produk sudah dipakai produk lain.');
        els.formName.focus();
      }

      Utils.showToast(message, 'error');
    } finally {
      setSaving(false);
    }
  }

  function showFieldError(field, message) {
    const wrapper = field.closest('[data-field]');
    const errorEl = wrapper ? wrapper.querySelector('[data-error]') : null;
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.remove('hidden');
    }
    field.classList.add('border-rose-400', 'focus:border-rose-400', 'focus:ring-rose-100');
    field.setAttribute('aria-invalid', 'true');
  }

  function setSaving(saving) {
    els.spinner.classList.toggle('hidden', !saving);
    els.saveLabel.textContent = saving
      ? 'Menyimpan…'
      : editingId
        ? 'Simpan Perubahan'
        : 'Simpan Produk';
    els.saveBtn.disabled = saving;
  }

  // ==========================================================================
  // HAPUS
  // ==========================================================================

  async function deleteProduct(id) {
    const product = allProducts.find((p) => p.id === id);
    if (!product) return;

    const ok = await Utils.confirmDialog({
      title: 'Hapus produk?',
      message:
        `Produk "${product.name}" akan dihapus permanen dari daftar. ` +
        'Transaksi lama tetap aman karena struk menyimpan salinan nama & harga.',
      confirmText: 'Ya, hapus',
      danger: true,
    });

    if (!ok) return;

    if (!window.isConfigured) {
      Utils.showToast(window.SUPABASE_INIT_ERROR, 'error');
      return;
    }

    try {
      const { error } = await getSupabase().from('products').delete().eq('id', id);
      if (error) throw error;

      Utils.showToast('Produk berhasil dihapus.', 'success');
      await loadProducts();
    } catch (error) {
      Utils.showToast(friendlyError(error), 'error');
    }
  }

  /** Mengubah status aktif / nonaktif tanpa membuka modal. */
  async function toggleActive(id) {
    const product = allProducts.find((p) => p.id === id);
    if (!product) return;

    try {
      const { error } = await getSupabase()
        .from('products')
        .update({ is_active: !product.is_active })
        .eq('id', id);
      if (error) throw error;

      Utils.showToast(
        product.is_active ? 'Produk dinonaktifkan.' : 'Produk diaktifkan.',
        'success'
      );
      await loadProducts();
    } catch (error) {
      Utils.showToast(friendlyError(error), 'error');
    }
  }

  // ==========================================================================
  // PRATINJAU GAMBAR
  // ==========================================================================

  function updateImagePreview() {
    const url = Utils.safeImageUrl(els.formImage.value.trim());
    if (!url) {
      els.previewWrap.classList.add('hidden');
      return;
    }
    els.preview.src = url;
    els.previewWrap.classList.remove('hidden');
  }

  // ==========================================================================
  // EVENT
  // ==========================================================================

  function bindEvents() {
    // Pencarian
    els.search.addEventListener(
      'input',
      Utils.debounce((event) => {
        searchQuery = event.target.value;
        renderTable();
      }, 250)
    );

    // Filter
    els.filterCategory.addEventListener('change', (event) => {
      filterCategory = event.target.value;
      renderTable();
    });

    els.filterStatus.addEventListener('change', (event) => {
      filterStatus = event.target.value;
      renderTable();
    });

    // Tombol tambah
    els.btnAdd.addEventListener('click', () => openForm(null));

    els.emptyAddBtn.addEventListener('click', () => openForm(null));

    // Aksi pada tabel (event delegation)
    els.tableBody.addEventListener('click', (event) => {
      const editBtn = event.target.closest('[data-action="edit"]');
      if (editBtn) {
        const product = allProducts.find((p) => p.id === Number(editBtn.dataset.id));
        if (product) openForm(product);
        return;
      }

      const delBtn = event.target.closest('[data-action="delete"]');
      if (delBtn) deleteProduct(Number(delBtn.dataset.id));
    });

    // Klik badge status untuk toggle aktif/nonaktif
    els.tableBody.addEventListener('click', (event) => {
      const toggle = event.target.closest('[data-action="toggle"]');
      if (toggle) {
        toggleActive(Number(toggle.dataset.id));
        return;
      }
    });

    // Submit form
    els.form.addEventListener('submit', handleSubmit);

    // Tutup modal
    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', closeForm);
    });

    // Escape menutup modal
    els.modal.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeForm();
    });

    // Pratinjau gambar saat URL diketik
    els.formImage.addEventListener('input', Utils.debounce(updateImagePreview, 400));
  }

  // ==========================================================================
  // INIT
  // ==========================================================================

  function cacheElements() {
    els = {
      search: document.getElementById('search-product'),
      filterCategory: document.getElementById('filter-category'),
      filterStatus: document.getElementById('filter-status'),
      btnAdd: document.getElementById('btn-add-product'),
      tableBody: document.getElementById('product-table-body'),
      loading: document.getElementById('product-loading'),
      empty: document.getElementById('product-empty'),
      emptyTitle: document.querySelector('#product-empty h3'),
      emptyText: document.querySelector('#product-empty p'),
      emptyAddBtn: document.querySelector('#product-empty [data-action="add-from-empty"]'),
      statTotal: document.getElementById('stat-total'),
      statActive: document.getElementById('stat-active'),
      statLow: document.getElementById('stat-low'),
      statOut: document.getElementById('stat-out'),

      modal: document.getElementById('product-modal'),
      modalTitle: document.getElementById('product-modal-title'),
      form: document.getElementById('product-form'),
      formName: document.getElementById('product-name'),
      formCategory: document.getElementById('product-category'),
      formPrice: document.getElementById('product-price'),
      formStock: document.getElementById('product-stock'),
      formImage: document.getElementById('product-image'),
      formDescription: document.getElementById('product-description'),
      formActive: document.getElementById('product-active'),
      preview: document.getElementById('image-preview'),
      previewWrap: document.getElementById('image-preview-wrap'),
      saveBtn: document.getElementById('btn-save-product'),
      saveLabel: document.querySelector('[data-save-label]'),
      spinner: document.querySelector('[data-spinner]'),
    };
  }

  async function init() {
    cacheElements();
    bindEvents();
    await loadCategories();
    await loadProducts();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init, reload: loadProducts };
})();
