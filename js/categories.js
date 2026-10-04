/**
 * POS-KU — Kelola Kategori
 * ---------------------------------------------------------------
 * Tanggung jawab file ini:
 *   1. Memuat seluruh kategori beserta jumlah produk di dalamnya
 *   2. Menambah / mengubah kategori lewat modal form
 *   3. Menghapus kategori (ditolak bila masih dipakai produk)
 *
 * Menghapus kategori TIDAK menghapus produk. Di database, kolom
 * products.category_id memakai ON DELETE SET NULL, jadi produk yang
 * ada di kategori tersebut menjadi "tanpa kategori" — riwayat
 * transaksi tetap utuh.
 */

const Categories = (() => {
  // ==========================================================================
  // STATE
  // ==========================================================================

  /** @type {Array<object>} kategori dari database */
  let allCategories = [];
  /** Map<categoryId, jumlahProduk> */
  let productCountByCategory = new Map();

  /** Id kategori yang sedang diedit. null = mode tambah. */
  let editingId = null;

  /** Elemen DOM (diisi saat init). */
  let els = {};

  // ==========================================================================
  // MEMUAT DATA
  // ==========================================================================

  /**
   * Mengambil kategori + hitungan produk dalam satu kali render.
   * Dua request paralel: kategori, dan hanya kolom category_id dari produk.
   */
  async function loadCategories() {
    if (!window.isConfigured) {
      renderCards([]);
      return;
    }

    els.loading.classList.remove('hidden');

    const [categoryResult, productResult] = await Promise.all([
      getSupabase().from('categories').select('id, name, description').order('name'),
      getSupabase().from('products').select('category_id'),
    ]);

    els.loading.classList.add('hidden');

    if (categoryResult.error) {
      Utils.showToast(friendlyError(categoryResult.error), 'error');
      renderCards([]);
      return;
    }

    allCategories = categoryResult.data || [];

    productCountByCategory = new Map();
    (productResult.data || []).forEach((row) => {
      if (row.category_id === null || row.category_id === undefined) return;
      productCountByCategory.set(
        row.category_id,
        (productCountByCategory.get(row.category_id) || 0) + 1
      );
    });

    renderCards(allCategories);
  }

  // ==========================================================================
  // RENDER
  // ==========================================================================

  function renderCards(categories) {
    if (categories.length === 0) {
      els.grid.innerHTML = '';
      els.empty.classList.remove('hidden');
      return;
    }

    els.empty.classList.add('hidden');
    els.grid.innerHTML = categories.map(cardTemplate).join('');
  }

  function cardTemplate(category) {
    const count = productCountByCategory.get(category.id) || 0;
    const initial = Utils.escapeHtml(String(category.name || '?').trim().charAt(0).toUpperCase());

    const countBadge = count
      ? `<span class="badge-brand">${count} produk</span>`
      : '<span class="badge-neutral">Belum ada produk</span>';

    return `
      <article class="card card-hover flex flex-col p-4" data-id="${category.id}">
        <div class="flex items-start gap-3">
          <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl
                       bg-gradient-to-br from-brand-500 to-brand-700 text-lg font-extrabold text-white shadow-glow">
            ${initial}
          </span>

          <div class="min-w-0 flex-1">
            <h3 class="truncate text-sm font-bold text-slate-900" title="${Utils.escapeHtml(category.name)}">
              ${Utils.escapeHtml(category.name)}
            </h3>
            <p class="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-500">
              ${category.description ? Utils.escapeHtml(category.description) : '<span class="italic">Tanpa keterangan</span>'}
            </p>
          </div>
        </div>

        <div class="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
          ${countBadge}
          <div class="flex gap-1">
            <button type="button" class="btn-ghost btn-icon" data-action="edit" data-id="${category.id}"
                    title="Ubah kategori" aria-label="Ubah ${Utils.escapeHtml(category.name)}">
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="1.9" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
              </svg>
            </button>
            <button type="button" class="btn-ghost btn-icon hover:bg-rose-50 hover:text-rose-600"
                    data-action="delete" data-id="${category.id}"
                    title="${count ? 'Tidak bisa dihapus: masih dipakai' : 'Hapus kategori'}"
                    aria-label="Hapus ${Utils.escapeHtml(category.name)}">
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="1.9" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
          </div>
        </div>
      </article>
    `;
  }

  // ==========================================================================
  // MODAL FORM
  // ==========================================================================

  function openForm(category) {
    editingId = category ? category.id : null;

    els.modalTitle.textContent = category ? 'Ubah Kategori' : 'Tambah Kategori';
    els.saveLabel.textContent = category ? 'Simpan Perubahan' : 'Simpan Kategori';

    els.form.reset();
    Utils.resetValidation(els.form);

    if (category) {
      els.formName.value = category.name || '';
      els.formDescription.value = category.description || '';
    }

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
    const description = els.formDescription.value.trim();

    if (name === '') {
      showFieldError(els.formName, 'Nama kategori wajib diisi.');
      els.formName.focus();
      return;
    }

    if (!window.isConfigured) {
      Utils.showToast(window.SUPABASE_INIT_ERROR || 'Koneksi database belum siap.', 'error');
      return;
    }

    setSaving(true);

    try {
      const payload = {
        name,
        description: description === '' ? null : description,
      };

      if (editingId) {
        const { error } = await getSupabase()
          .from('categories')
          .update(payload)
          .eq('id', editingId);
        if (error) throw error;
        Utils.showToast('Kategori berhasil diperbarui.', 'success');
      } else {
        const { error } = await getSupabase().from('categories').insert(payload);
        if (error) throw error;
        Utils.showToast('Kategori berhasil ditambahkan.', 'success');
      }

      closeForm();
      await loadCategories();
    } catch (error) {
      const message = friendlyError(error);

      // Nama kategori unik -> arahkan error ke kolom nama.
      if (/sudah ada|unique/i.test(message)) {
        showFieldError(els.formName, 'Nama kategori sudah dipakai kategori lain.');
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
        : 'Simpan Kategori';
    els.saveBtn.disabled = saving;
  }

  // ==========================================================================
  // HAPUS
  // ==========================================================================

  async function deleteCategory(id) {
    const category = allCategories.find((c) => c.id === id);
    if (!category) return;

    const count = productCountByCategory.get(id) || 0;

    let ok;
    if (count > 0) {
      ok = await Utils.confirmDialog({
        title: 'Kategori masih dipakai',
        message:
          `Kategori "${category.name}" berisi ${count} produk. ` +
          'Bila dihapus, produk tetap tersimpan namun menjadi tanpa kategori.',
        confirmText: 'Ya, hapus tetap',
        danger: true,
      });
    } else {
      ok = await Utils.confirmDialog({
        title: 'Hapus kategori?',
        message: `Kategori "${category.name}" akan dihapus permanen dari daftar.`,
        confirmText: 'Ya, hapus',
        danger: true,
      });
    }

    if (!ok) return;

    if (!window.isConfigured) {
      Utils.showToast(window.SUPABASE_INIT_ERROR || 'Koneksi database belum siap.', 'error');
      return;
    }

    try {
      const { error } = await getSupabase().from('categories').delete().eq('id', id);
      if (error) throw error;

      Utils.showToast('Kategori berhasil dihapus.', 'success');
      await loadCategories();
    } catch (error) {
      Utils.showToast(friendlyError(error), 'error');
    }
  }

  // ==========================================================================
  // EVENT
  // ==========================================================================

  function bindEvents() {
    els.btnAdd.addEventListener('click', () => openForm(null));
    els.btnAddEmpty.addEventListener('click', () => openForm(null));

    // Aksi pada kartu (event delegation)
    els.grid.addEventListener('click', (event) => {
      const editBtn = event.target.closest('[data-action="edit"]');
      if (editBtn) {
        const category = allCategories.find((c) => c.id === Number(editBtn.dataset.id));
        if (category) openForm(category);
        return;
      }

      const delBtn = event.target.closest('[data-action="delete"]');
      if (delBtn) deleteCategory(Number(delBtn.dataset.id));
    });

    els.form.addEventListener('submit', handleSubmit);

    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', closeForm);
    });

    els.modal.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeForm();
    });
  }

  // ==========================================================================
  // INIT
  // ==========================================================================

  function cacheElements() {
    els = {
      grid: document.getElementById('category-grid'),
      loading: document.getElementById('category-loading'),
      empty: document.getElementById('category-empty'),
      btnAdd: document.getElementById('btn-add-category'),
      btnAddEmpty: document.getElementById('btn-add-empty'),

      modal: document.getElementById('category-modal'),
      modalTitle: document.getElementById('category-modal-title'),
      form: document.getElementById('category-form'),
      formName: document.getElementById('category-name'),
      formDescription: document.getElementById('category-description'),
      saveBtn: document.getElementById('btn-save-category'),
      saveLabel: document.querySelector('[data-save-label]'),
      spinner: document.querySelector('[data-spinner]'),
    };
  }

  async function init() {
    cacheElements();
    bindEvents();
    await loadCategories();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init, reload: loadCategories };
})();
