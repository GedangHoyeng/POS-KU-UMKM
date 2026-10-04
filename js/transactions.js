/**
 * POS-KU — Modul Riwayat Transaksi
 * ---------------------------------------------------------------
 * Tanggung jawab file ini:
 *   1. Memuat seluruh transaksi dari database
 *   2. Pencarian nomor transaksi, filter tanggal
 *   3. Menampilkan ringkasan: jumlah transaksi, item terjual, total omzet
 *   4. Membuka modal detail struk (isi item, total, kembalian)
 *   5. Menghubungkan ke halaman struk digital (receipt.html)
 *
 * Semua elemen DOM sudah tersedia di transactions.html — file ini
 * hanya mengisinya lewat JavaScript.
 */

const Transactions = (() => {
  // ==========================================================================
  // STATE
  // ==========================================================================

  /** @type {Array<object>} seluruh transaksi (cache lokal) */
  let allTransactions = [];
  /** @type {Map<number, Array<object>>} detail item per transaksi */
  let itemsByTransaction = new Map();
  /** Id transaksi yang sedang dibuka di modal detail */
  let currentDetailId = null;
  /** Elemen DOM */
  let els = {};

  // ==========================================================================
  // MEMUAT DATA
  // ==========================================================================

  async function loadTransactions() {
    if (!window.isConfigured) {
      renderEmpty();
      return;
    }

    els.loading.classList.remove('hidden');
    const { data, error } = await getSupabase()
      .from('transactions')
      .select(
        'id, transaction_number, total_amount, paid_amount, change_amount, item_count, transaction_date'
      )
      .order('transaction_date', { ascending: false });

    els.loading.classList.add('hidden');

    if (error) {
      console.error('[POS-KU] Gagal memuat transaksi:', error);
      Utils.showToast(friendlyError(error), 'error');
      allTransactions = [];
      renderTable();
      return;
    }

    allTransactions = data || [];
    await loadAllItems();
    renderTable();
  }

  /** Ambil detail item untuk semua transaksi sekaligus. */
  async function loadAllItems() {
    itemsByTransaction = new Map();

    if (allTransactions.length === 0) return;

    const ids = allTransactions.map((t) => t.id);
    const { data, error } = await getSupabase()
      .from('transaction_items')
      .select('transaction_id, product_name, price, quantity, subtotal')
      .in('transaction_id', ids);

    if (error) {
      console.warn('[POS-KU] Gagal memuat detail item:', error);
      return;
    }

    (data || []).forEach((item) => {
      if (!itemsByTransaction.has(item.transaction_id)) {
        itemsByTransaction.set(item.transaction_id, []);
      }
      itemsByTransaction.get(item.transaction_id).push(item);
    });
  }

  // ==========================================================================
  // FILTER
  // ==========================================================================

  function getFiltered() {
    const query = els.search.value.trim().toLowerCase();
    const dateFilter = els.filterDate.value;

    return allTransactions.filter((t) => {
      if (query && !String(t.transaction_number).toLowerCase().includes(query)) return false;
      if (dateFilter && isoDateKey(new Date(t.transaction_date)) !== dateFilter) return false;
      return true;
    });
  }

  // ==========================================================================
  // RENDER
  // ==========================================================================

  function renderTable() {
    const transactions = getFiltered();

    renderStats(transactions);

    if (allTransactions.length === 0) {
      els.tableBody.innerHTML = '';
      els.empty.classList.remove('hidden');
      return;
    }

    els.empty.classList.add('hidden');

    if (transactions.length === 0) {
      els.tableBody.innerHTML = `
        <tr>
          <td colspan="5">
            <div class="empty-state py-12">
              <h3 class="text-base font-bold text-slate-900">Tidak ditemukan</h3>
              <p class="mt-1.5 text-sm text-slate-600">
                Tidak ada transaksi yang cocok dengan filter ini.
              </p>
            </div>
          </td>
        </tr>`;
      return;
    }

    els.tableBody.innerHTML = transactions
      .map((t) => {
        const items = itemsByTransaction.get(t.id) || [];
        const itemNames = items
          .slice(0, 3)
          .map((i) => Utils.escapeHtml(i.product_name))
          .join(', ');
        const moreItems =
          items.length > 3
            ? ` <span class="text-slate-400">+${items.length - 3} lainnya</span>`
            : '';

        return `
          <tr data-id="${t.id}">
            <td>
              <p class="font-bold tabular text-slate-900">${Utils.escapeHtml(t.transaction_number)}</p>
            </td>
            <td class="text-slate-600">${Utils.formatDateTime(t.transaction_date)}</td>
            <td class="text-center">
              <p class="text-xs text-slate-500">
                ${items.length > 0 ? itemNames + moreItems : '—'}
              </p>
            </td>
            <td class="text-right font-bold tabular text-slate-900">${Utils.formatRupiah(t.total_amount)}</td>
            <td>
              <div class="flex justify-end gap-1">
                <button type="button"
                        class="btn-ghost btn-icon"
                        data-action="view-detail"
                        data-id="${t.id}"
                        title="Lihat detail"
                        aria-label="Lihat detail transaksi ${Utils.escapeHtml(t.transaction_number)}">
                  <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="1.9" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
                <a href="receipt.html?id=${encodeURIComponent(t.transaction_number)}"
                   class="btn-ghost btn-icon"
                   title="Lihat struk"
                   aria-label="Lihat struk ${Utils.escapeHtml(t.transaction_number)}">
                  <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="1.9" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03-.48.062.72-.096M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5z" />
                  </svg>
                </a>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  function renderStats(transactions) {
    const count = transactions.length;
    const items = transactions.reduce((sum, t) => sum + (t.item_count || 0), 0);
    const revenue = transactions.reduce((sum, t) => sum + Number(t.total_amount || 0), 0);

    els.statCount.textContent = Utils.formatNumber(count);
    els.statItems.textContent = Utils.formatNumber(items);
    els.statRevenue.textContent = Utils.formatRupiah(revenue);
  }

  function renderEmpty() {
    els.tableBody.innerHTML = '';
    els.empty.classList.remove('hidden');
    renderStats([]);
  }

  // ==========================================================================
  // MODAL DETAIL
  // ==========================================================================

  function openDetailModal(transactionId) {
    const t = allTransactions.find((x) => x.id === transactionId);
    if (!t) return;

    currentDetailId = t.id;

    els.detailNumber.textContent = t.transaction_number;
    els.detailDate.textContent = Utils.formatDateTime(t.transaction_date);
    els.detailItems.textContent = `${t.item_count || 0} jenis, ${(
      itemsByTransaction.get(t.id) || []
    ).reduce((sum, i) => sum + (i.quantity || 0), 0)} unit`;
    els.detailTotal.textContent = Utils.formatRupiah(t.total_amount);
    els.detailPaid.textContent = Utils.formatRupiah(t.paid_amount);
    els.detailChange.textContent = Utils.formatRupiah(t.change_amount);

    const items = itemsByTransaction.get(t.id) || [];
    if (items.length === 0) {
      els.detailItemsList.innerHTML =
        '<div class="py-6 text-center text-sm text-slate-500">Detail item tidak tersedia.</div>';
    } else {
      els.detailItemsList.innerHTML = items
        .map(
          (item) => `
          <div class="flex items-center justify-between gap-3 px-3 py-2.5">
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-semibold text-slate-900">${Utils.escapeHtml(item.product_name)}</p>
              <p class="text-xs text-slate-500">
                ${Utils.formatNumber(item.quantity)} × ${Utils.formatRupiah(item.price)}
              </p>
            </div>
            <p class="text-sm font-bold tabular text-slate-900">${Utils.formatRupiah(item.subtotal)}</p>
          </div>
        `
        )
        .join('');
    }

    els.detailReceiptLink.href = `receipt.html?id=${encodeURIComponent(t.transaction_number)}`;

    Utils.openModal(els.modal);
  }

  function closeDetailModal() {
    Utils.closeModal(els.modal);
    currentDetailId = null;
  }

  // ==========================================================================
  // EVENT
  // ==========================================================================

  function bindEvents() {
    // Pencarian (debounce)
    els.search.addEventListener(
      'input',
      Utils.debounce(() => renderTable(), 200)
    );

    // Filter tanggal
    els.filterDate.addEventListener('change', () => renderTable());

    // Reset filter
    els.btnReset.addEventListener('click', () => {
      els.search.value = '';
      els.filterDate.value = '';
      renderTable();
    });

    // Klik baris: buka modal detail
    els.tableBody.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-action="view-detail"]');
      if (btn) {
        openDetailModal(Number(btn.dataset.id));
      }
    });

    // Tutup modal
    document.querySelectorAll('[data-close-modal]').forEach((el) => {
      el.addEventListener('click', closeDetailModal);
    });

    els.modal.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeDetailModal();
    });
  }

  // ==========================================================================
  // UTILS
  // ==========================================================================

  function isoDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate()
    ).padStart(2, '0')}`;
  }

  // ==========================================================================
  // CACHE ELEMENTS
  // ==========================================================================

  function cacheElements() {
    els = {
      search: document.getElementById('search-transaction'),
      filterDate: document.getElementById('filter-date'),
      btnReset: document.getElementById('btn-reset-filter'),
      tableBody: document.getElementById('transaction-table-body'),
      loading: document.getElementById('transaction-loading'),
      empty: document.getElementById('transaction-empty'),
      statCount: document.getElementById('stat-count'),
      statItems: document.getElementById('stat-items'),
      statRevenue: document.getElementById('stat-revenue'),

      modal: document.getElementById('transaction-modal'),
      detailNumber: document.getElementById('detail-number'),
      detailDate: document.getElementById('detail-date'),
      detailItems: document.getElementById('detail-items'),
      detailTotal: document.getElementById('detail-total'),
      detailPaid: document.getElementById('detail-paid'),
      detailChange: document.getElementById('detail-change'),
      detailItemsList: document.getElementById('detail-items-list'),
      detailReceiptLink: document.getElementById('detail-receipt-link'),
    };
  }

  // ==========================================================================
  // INIT
  // ==========================================================================

  async function init() {
    cacheElements();
    bindEvents();
    await loadTransactions();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init, reload: loadTransactions };
})();
