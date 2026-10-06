/**
 * POS-KU — Struk Digital (receipt.js)
 * ---------------------------------------------------------------
 * Tanggung jawab:
 *   1. Membaca parameter URL (?id=TRX-...)
 *   2. Memuat transaksi + item dari database
 *   3. Merender kertas struk (informasi toko, item, total, kembalian)
 *   4. Aksi: Cetak (window.print), Salin teks struk, Kirim WhatsApp
 *
 * Halaman ini bersifat publik — TIDAK memakai sidebar admin (lihat app.js
 * renderShell(): receipt.html ditandai sebagai halaman publik).
 */

const Receipt = (() => {
  /** @type {object|null} transaksi yang sedang ditampilkan */
  let transaction = null;
  /** @type {Array<object>} item transaksi */
  let items = [];
  /** @type {object|null} profil toko */
  let storeProfile = null;
  /** Teks struk dalam bentuk plain text (untuk salin & WhatsApp) */
  let plainText = '';

  // ==========================================================================
  // AMBIL PARAMETER URL
  // ==========================================================================

  function getTransactionNumberFromUrl() {
    const params = new URLSearchParams(window.location.search);
    // Hash (#id=...) dipakai sebagai cadangan kedua untuk server yang
    // membuang query string saat me-redirect .html menjadi URL bersih.
    const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    return (params.get('id') || fromHash.get('id') || '').trim();
  }

  /**
   * Membaca nomor transaksi dari sessionStorage.
   *
   * Kasir menyimpan nomor transaksi hasil checkout yang sebenarnya di sini,
   * sehingga struk tetap bisa dibuka walau query string URL hilang (mis. saat
   * server development me-redirect /receipt.html?id=... ke /receipt).
   * Tidak ada nomor yang di-hardcode: nilainya selalu berasal dari RPC.
   */
  function getTransactionNumberFromSession() {
    try {
      return (window.sessionStorage.getItem('posku:lastTransactionNumber') || '').trim();
    } catch (error) {
      return '';
    }
  }

  // ==========================================================================
  // MEMUAT DATA
  // ==========================================================================

  async function loadData() {
    const number = getTransactionNumberFromUrl() || getTransactionNumberFromSession();

    if (!number) {
      showNotFound('Parameter transaksi tidak ditemukan di URL.');
      return;
    }

    if (!window.isConfigured) {
      showNotFound(window.SUPABASE_INIT_ERROR || 'Database belum siap.');
      return;
    }

    // Profil toko (fallback ke config bila gagal).
    const profileRes = await getSupabase()
      .from('store_profile')
      .select('store_name, tagline, whatsapp_number, address')
      .eq('id', 1)
      .maybeSingle();

    const fallback = window.APP_CONFIG.STORE;
    storeProfile = profileRes.data || {
      store_name: fallback.name,
      tagline: fallback.tagline,
      whatsapp_number: fallback.whatsapp,
      address: fallback.address,
    };

    // Transaksi.
    const txRes = await getSupabase()
      .from('transactions')
      .select(
        'id, transaction_number, total_amount, paid_amount, change_amount, item_count, transaction_date'
      )
      .eq('transaction_number', number)
      .maybeSingle();

    if (txRes.error) {
      console.error('[POS-KU] Gagal memuat transaksi:', txRes.error);
      showNotFound(friendlyError(txRes.error));
      return;
    }

    if (!txRes.data) {
      showNotFound('Nomor transaksi tidak ditemukan di database.');
      return;
    }

    transaction = txRes.data;

    // Item transaksi.
    const itemRes = await getSupabase()
      .from('transaction_items')
      .select('product_name, price, quantity, subtotal')
      .eq('transaction_id', transaction.id)
      .order('id');

    items = itemRes.data || [];

    render();
  }

  // ==========================================================================
  // RENDER
  // ==========================================================================

  function render() {
    const root = document.getElementById('receipt-root');
    const notFound = document.getElementById('receipt-not-found');

    if (notFound) notFound.classList.add('hidden');
    if (root) root.classList.remove('hidden');

    // Header toko.
    setText('receipt-store-name', storeProfile.store_name || 'POS-KU');
    setText('receipt-store-tagline', storeProfile.tagline || '');
    setText('receipt-store-address', storeProfile.address || '');

    // Info transaksi.
    setText('receipt-number', transaction.transaction_number);
    setText('receipt-date', Utils.formatDateTime(transaction.transaction_date));

    // Item.
    const container = document.getElementById('receipt-items');
    container.innerHTML = items
      .map(
        (item) => `
        <div class="flex justify-between gap-2">
          <div class="min-w-0 flex-1">
            <p class="truncate font-medium text-slate-800">${Utils.escapeHtml(item.product_name)}</p>
            <p class="text-[10px] text-slate-500">${Utils.formatNumber(item.quantity)} × ${Utils.formatRupiah(item.price)}</p>
          </div>
          <p class="shrink-0 tabular text-slate-900">${Utils.formatRupiah(item.subtotal)}</p>
        </div>`
      )
      .join('');

    // Ringkasan.
    setText('receipt-total', Utils.formatRupiah(transaction.total_amount));
    setText('receipt-paid', Utils.formatRupiah(transaction.paid_amount));
    setText('receipt-change', Utils.formatRupiah(transaction.change_amount));

    // Footer.
    setText(
      'receipt-generated',
      'Dicetak ' + Utils.formatDateTime(new Date().toISOString())
    );

    // Susun teks polos untuk salin & WhatsApp.
    plainText = buildPlainText();

    // Judul halaman.
    document.title = `Struk ${transaction.transaction_number} — POS-KU`;
  }

  function showNotFound(message) {
    const root = document.getElementById('receipt-root');
    const notFound = document.getElementById('receipt-not-found');
    if (root) root.classList.add('hidden');
    if (notFound) {
      notFound.classList.remove('hidden');
      const p = notFound.querySelector('p');
      if (p) p.textContent = message;
    }
    const printBtn = document.getElementById('btn-print');
    const copyBtn = document.getElementById('btn-copy');
    const waBtn = document.getElementById('btn-whatsapp');
    if (printBtn) printBtn.disabled = true;
    if (copyBtn) copyBtn.disabled = true;
    if (waBtn) waBtn.disabled = true;
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  // ==========================================================================
  // TEKS STRUK (plain text)
  // ==========================================================================

  function buildPlainText() {
    if (!transaction) return '';

    const lines = [];
    const dashes = '-'.repeat(32);

    lines.push(storeProfile.store_name || 'POS-KU');
    if (storeProfile.address) lines.push(storeProfile.address);
    lines.push(dashes);
    lines.push(`No : ${transaction.transaction_number}`);
    lines.push(`Tgl: ${Utils.formatDateTime(transaction.transaction_date)}`);
    lines.push(dashes);

    items.forEach((item) => {
      lines.push(item.product_name);
      lines.push(
        `  ${Utils.formatNumber(item.quantity)} x ${Utils.formatNumber(
          item.price
        )} = ${Utils.formatNumber(item.subtotal)}`
      );
    });

    lines.push(dashes);
    lines.push(`TOTAL   : ${Utils.formatNumber(transaction.total_amount)}`);
    lines.push(`BAYAR   : ${Utils.formatNumber(transaction.paid_amount)}`);
    lines.push(`KEMBALI : ${Utils.formatNumber(transaction.change_amount)}`);
    lines.push(dashes);
    lines.push('Terima kasih telah berbelanja.');

    return lines.join('\n');
  }

  // ==========================================================================
  // AKSI
  // ==========================================================================

  function bindActions() {
    const printBtn = document.getElementById('btn-print');
    const copyBtn = document.getElementById('btn-copy');
    const waBtn = document.getElementById('btn-whatsapp');

    if (printBtn) {
      printBtn.addEventListener('click', () => window.print());
    }

    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        if (!plainText) return;
        const ok = await Utils.copyToClipboard(plainText);
        if (ok) {
          Utils.showToast('Struk berhasil disalin ke papan klip.', 'success');
        } else {
          Utils.showToast('Gagal menyalin struk.', 'error');
        }
      });
    }

    if (waBtn) {
      waBtn.addEventListener('click', () => {
        if (!plainText) return;
        const number = storeProfile.whatsapp_number || '';
        const url = Utils.buildWhatsAppUrl(number, plainText);
        window.open(url, '_blank', 'noopener,noreferrer');
      });
    }
  }

  // ==========================================================================
  // INIT
  // ==========================================================================

  async function init() {
    bindActions();
    await loadData();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init };
})();
