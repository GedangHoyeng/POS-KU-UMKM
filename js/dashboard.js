/**
 * POS-KU — Dashboard Module
 * Tanggung jawab:
 *   1. Ringkasan transaksi hari ini
 *   2. Grafik omzet 7 hari terakhir (canvas sederhana)
 *   3. Produk terlaris (berdasarkan quantity item keluar)
 *   4. Produk dengan stok menipis
 *   5. Semua elemen DOM sudah ada di dashboard.html
 */

const Dashboard = (() => {
  /** @type {Array<object>} */ let allTransactions = [];
  /** @type {Array<object>} */ let allProducts = [];
  /** @type {Array<object>} */ let allItems = [];

  // ==========================================================================
  // MEMUAT DATA
  // ==========================================================================

  async function loadData() {
    const txRes = await getSupabase()
      .from('transactions')
      .select('id, total_amount, item_count, transaction_date')
      .order('transaction_date', { ascending: false });

    const prodRes = await getSupabase()
      .from('products')
      .select('id, name, price, stock, image_url, category_id')
      .order('name');

    const itemRes = await getSupabase()
      .from('transaction_items')
      .select('transaction_id, product_id, product_name, quantity, subtotal');

    if (txRes.error) console.warn('[POS-KU] Gagal muat transaksi:', txRes.error);
    if (prodRes.error) console.warn('[POS-KU] Gagal muat produk:', prodRes.error);
    if (itemRes.error) console.warn('[POS-KU] Gagal muat item:', itemRes.error);

    allTransactions = txRes.data || [];
    allProducts = prodRes.data || [];
    allItems = itemRes.data || [];
  }

  // ==========================================================================
  // RINGKASAN HARI INI
  // ==========================================================================

  function renderTodaySummary() {
    const now = new Date();
    const todayKey = isoDateKey(now);

    const todayTxs = allTransactions.filter(
      (t) => isoDateKey(new Date(t.transaction_date)) === todayKey
    );

    const revenue = todayTxs.reduce((sum, t) => sum + Number(t.total_amount || 0), 0);
    const transactions = todayTxs.length;
    const items = todayTxs.reduce((sum, t) => sum + Number(t.item_count || 0), 0);
    const aov = transactions > 0 ? revenue / transactions : 0;

    setText('stat-today-revenue', Utils.formatRupiah(revenue));
    setText('stat-today-transactions', Utils.formatNumber(transactions));
    setText('stat-today-items', Utils.formatNumber(items));
    setText('stat-today-aov', Utils.formatRupiah(aov));
  }

  // ==========================================================================
  // GRAFIK OMZET 7 HARI
  // ==========================================================================

  function buildDailySales() {
    const buckets = new Map();

    allTransactions.forEach((row) => {
      const date = new Date(row.transaction_date);
      const key = isoDateKey(date);

      if (!buckets.has(key)) {
        buckets.set(key, { sale_date: key, total_transactions: 0, total_revenue: 0, total_items: 0 });
      }

      const b = buckets.get(key);
      b.total_transactions += 1;
      b.total_revenue += Number(row.total_amount || 0);
      b.total_items += Number(row.item_count || 0);
    });

    return Array.from(buckets.values()).sort((a, b) => (a.sale_date < b.sale_date ? -1 : 1));
  }

  function renderRevenueChart() {
    const canvasEl = document.getElementById('revenue-chart');
    const container = document.getElementById('revenue-chart-container');
    if (!canvasEl || !canvasEl.getContext) return;

    // Ukur kontainer agar canvas responsif
    const width = container ? container.clientWidth : 600;
    const height = container ? container.clientHeight : 256;
    canvasEl.width = Math.max(width, 200);
    canvasEl.height = Math.max(height, 160);

    const ctx = canvasEl.getContext('2d');
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    const sorted = buildDailySales().slice(-7);

    if (sorted.length === 0) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px Plus Jakarta Sans';
      ctx.textAlign = 'center';
      ctx.fillText('Belum ada data penjualan', canvasEl.width / 2, canvasEl.height / 2);
      const periodEl = document.getElementById('chart-period');
      if (periodEl) periodEl.textContent = '';
      return;
    }

    const padding = { top: 24, right: 16, bottom: 28, left: 48 };
    const chartW = canvasEl.width - padding.left - padding.right;
    const chartH = canvasEl.height - padding.top - padding.bottom;

    let maxVal = Math.max(...sorted.map((b) => b.total_revenue), 1);
    maxVal *= 1.15;

    // Grid horizontal + label sumbu Y
    ctx.strokeStyle = '#e2e8f0';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px Plus Jakarta Sans';
    ctx.textAlign = 'right';
    ctx.lineWidth = 1;

    for (let i = 0; i <= 4; i += 1) {
      const y = padding.top + (chartH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(canvasEl.width - padding.right, y);
      ctx.stroke();

      const value = maxVal * (1 - i / 4);
      ctx.fillText(compactNumber(value), padding.left - 6, y + 3);
    }

    // Batang
    const slot = chartW / sorted.length;
    const barW = Math.min(34, slot * 0.6);

    sorted.forEach((b, idx) => {
      const x = padding.left + idx * slot + (slot - barW) / 2;
      const h = Math.max((b.total_revenue / maxVal) * chartH, 2);
      const y = padding.top + chartH - h;

      // Bar dengan gradien
      const grad = ctx.createLinearGradient(0, y, 0, y + h);
      grad.addColorStop(0, '#14b8a6');
      grad.addColorStop(1, '#0f766e');
      ctx.fillStyle = grad;
      roundRect(ctx, x, y, barW, h, 4);
      ctx.fill();

      // Label nilai di atas batang
      ctx.fillStyle = '#475569';
      ctx.font = '9px Plus Jakarta Sans';
      ctx.textAlign = 'center';
      ctx.fillText(compactNumber(b.total_revenue), x + barW / 2, y - 6);

      // Label tanggal di sumbu X
      const parts = b.sale_date.split('-');
      const label = parts[2] + '/' + parts[1];
      ctx.fillStyle = '#64748b';
      ctx.fillText(label, x + barW / 2, canvasEl.height - 10);
    });

    const periodEl = document.getElementById('chart-period');
    if (periodEl) {
      periodEl.textContent =
        sorted[0].sale_date + ' → ' + sorted[sorted.length - 1].sale_date;
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function compactNumber(n) {
    const v = Number(n) || 0;
    if (v >= 1000000) return 'Rp ' + (v / 1000000).toFixed(1) + 'jt';
    if (v >= 1000) return 'Rp ' + Math.round(v / 1000) + 'rb';
    return 'Rp ' + v;
  }

  // ==========================================================================
  // PRODUK TERLARIS
  // ==========================================================================

  function renderTopProducts() {
    const sales = new Map();

    allItems.forEach((it) => {
      const pid = it.product_id;
      const prev = sales.get(pid) || { quantity: 0, revenue: 0, name: it.product_name || '—' };
      sales.set(pid, {
        quantity: prev.quantity + Number(it.quantity || 0),
        revenue: prev.revenue + Number(it.subtotal || 0),
        name: it.product_name || prev.name || '—',
      });
    });

    const ranked = Array.from(sales.entries())
      .map(([id, info]) => {
        const product = allProducts.find((p) => p.id === id) || {};
        return { id, ...info, product };
      })
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    const container = document.getElementById('top-products-list');
    const empty = document.getElementById('top-products-empty');
    const loading = document.getElementById('top-products-loading');

    if (loading) loading.classList.add('hidden');

    if (ranked.length === 0) {
      if (container) container.classList.add('hidden');
      if (empty) empty.classList.remove('hidden');
      return;
    }

    if (empty) empty.classList.add('hidden');
    if (container) container.classList.remove('hidden');

    const totalQty = ranked.reduce((s, x) => s + x.quantity, 0);

    container.innerHTML = ranked
      .map(
        (row) => `
        <div class="flex items-center gap-3 py-2.5">
          <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-sm font-extrabold text-brand-600">
            ${Utils.escapeHtml(String(row.name || '?').charAt(0).toUpperCase())}
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-semibold text-slate-900">${Utils.escapeHtml(row.name)}</p>
            <p class="text-xs text-slate-500">${Utils.formatNumber(row.quantity)} terjual · ${Utils.formatRupiah(row.revenue)}</p>
          </div>
          <span class="text-xs font-bold text-brand-700">${Math.round(
            (row.quantity / Math.max(totalQty, 1)) * 100
          )}%</span>
        </div>`
      )
      .join('');
  }

  // ==========================================================================
  // STOK MENIPIS
  // ==========================================================================

  function renderLowStock() {
    const threshold = window.APP_CONFIG?.LOW_STOCK_THRESHOLD ?? 5;
    const low = allProducts
      .filter((p) => Number(p.stock) <= threshold)
      .sort((a, b) => Number(a.stock) - Number(b.stock))
      .slice(0, 6);

    const container = document.getElementById('low-stock-list');
    const empty = document.getElementById('low-stock-empty');
    const loading = document.getElementById('low-stock-loading');

    if (loading) loading.classList.add('hidden');

    if (low.length === 0) {
      if (container) container.classList.add('hidden');
      if (empty) empty.classList.remove('hidden');
      return;
    }

    if (empty) empty.classList.add('hidden');
    if (container) container.classList.remove('hidden');

    container.innerHTML = low
      .map(
        (p) => `
        <div class="flex items-center gap-3 py-2.5">
          <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-sm font-extrabold text-amber-600">
            ${Utils.escapeHtml(String(p.name || '?').charAt(0).toUpperCase())}
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-semibold text-slate-900">${Utils.escapeHtml(p.name)}</p>
            <p class="text-xs text-slate-500">${Utils.formatRupiah(p.price)}</p>
          </div>
          ${
            Number(p.stock) <= 0
              ? '<span class="badge-danger">Habis</span>'
              : `<span class="badge-warning">Sisa ${p.stock}</span>`
          }
        </div>`
      )
      .join('');
  }

  // ==========================================================================
  // UTILS
  // ==========================================================================

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function isoDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate()
    ).padStart(2, '0')}`;
  }

  // ==========================================================================
  // INIT
  // ==========================================================================

  async function init() {
    await loadData();
    renderTodaySummary();
    renderRevenueChart();
    renderTopProducts();
    renderLowStock();
  }

  return { init };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', Dashboard.init);
} else {
  Dashboard.init();
}
