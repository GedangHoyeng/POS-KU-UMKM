/**
 * POS-KU — Laporan & Grafik (reports.js)
 * ---------------------------------------------------------------
 * Tanggung jawab:
 *   1. Memuat transaksi, item, produk, kategori
 *   2. Filter berdasarkan periode (7 / 30 / 90 hari)
 *   3. Menghitung ringkasan: omzet, transaksi, item, rata-rata, hari terbaik
 *   4. Menggambar grafik tren omzet (line chart di canvas)
 *   5. Menggrafik omzet per kategori + daftar breakdown
 *   6. Tabel produk terlaris pada periode terpilih
 */

const Reports = (() => {
  /** Periode aktif dalam jumlah hari */
  let periodDays = 7;

  /** @type {Array<object>} */ let allTransactions = [];
  /** @type {Array<object>} */ let allItems = [];
  /** @type {Array<object>} */ let allProducts = [];
  /** @type {Array<object>} */ let allCategories = [];

  // ==========================================================================
  // MEMUAT DATA
  // ==========================================================================

  async function loadAll() {
    const [tx, items, products, cats] = await Promise.all([
      getSupabase()
        .from('transactions')
        .select('id, transaction_number, total_amount, item_count, transaction_date')
        .order('transaction_date', { ascending: true }),
      getSupabase()
        .from('transaction_items')
        .select('transaction_id, product_id, product_name, quantity, subtotal'),
      getSupabase().from('products').select('id, name, category_id, price'),
      getSupabase().from('categories').select('id, name'),
    ]);

    if (tx.error) console.warn('[POS-KU] Gagal muat transaksi:', tx.error);
    if (items.error) console.warn('[POS-KU] Gagal muat item:', items.error);
    if (products.error) console.warn('[POS-KU] Gagal muat produk:', products.error);
    if (cats.error) console.warn('[POS-KU] Gagal muat kategori:', cats.error);

    allTransactions = tx.data || [];
    allItems = items.data || [];
    allProducts = products.data || [];
    allCategories = cats.data || [];
  }

  // ==========================================================================
  // FILTER PERIODE
  // ==========================================================================

  /** Batas bawah periode dalam timestamp milidetik. */
  function periodStart() {
    const date = new Date();
    date.setDate(date.getDate() - (periodDays - 1));
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }

  function getTransactionsInPeriod() {
    const start = periodStart();
    return allTransactions.filter((t) => new Date(t.transaction_date).getTime() >= start);
  }

  function getTransactionIdsInPeriod() {
    return new Set(getTransactionsInPeriod().map((t) => t.id));
  }

  // ==========================================================================
  // RINGKASAN
  // ==========================================================================

  function renderSummary() {
    const txs = getTransactionsInPeriod();

    const revenue = txs.reduce((s, t) => s + Number(t.total_amount || 0), 0);
    const items = txs.reduce((s, t) => s + Number(t.item_count || 0), 0);
    const aov = txs.length ? revenue / txs.length : 0;

    setText('report-revenue', Utils.formatRupiah(revenue));
    setText('report-transactions', Utils.formatNumber(txs.length));
    setText('report-items', Utils.formatNumber(items));
    setText('report-aov', Utils.formatRupiah(aov));

    // Tren: bandingkan dengan periode sebelumnya dengan panjang sama.
    const prev = getPreviousPeriodTransactions();
    const prevRevenue = prev.reduce((s, t) => s + Number(t.total_amount || 0), 0);
    const trendEl = document.getElementById('report-revenue-trend');

    if (prevRevenue > 0) {
      const delta = ((revenue - prevRevenue) / prevRevenue) * 100;
      const up = delta >= 0;
      trendEl.className = 'mt-1 text-xs font-semibold ' + (up ? 'text-emerald-600' : 'text-rose-600');
      trendEl.textContent = `${up ? '▲' : '▼'} ${Math.abs(delta).toFixed(1)}% vs periode lalu`;
    } else {
      trendEl.className = 'mt-1 text-xs text-slate-500';
      trendEl.textContent = 'Belum ada pembanding periode lalu';
    }

    // Hari terbaik.
    const daily = buildDaily(txs);
    let best = null;
    daily.forEach((d) => {
      if (!best || d.total_revenue > best.total_revenue) best = d;
    });

    if (best && best.total_revenue > 0) {
      setText('report-best-day', Utils.formatDateShort(best.sale_date));
      setText(
        'report-best-day-value',
        Utils.formatRupiah(best.total_revenue) + ' · ' + best.total_transactions + ' transaksi'
      );
    } else {
      setText('report-best-day', '—');
      setText('report-best-day-value', '');
    }

    // Caption periode.
    const start = new Date(periodStart());
    const end = new Date();
    const caption = document.getElementById('period-caption');
    if (caption) {
      caption.textContent = `${Utils.formatDateShort(start.toISOString())} – ${Utils.formatDateShort(
        end.toISOString()
      )} (${periodDays} hari)`;
    }

    return daily;
  }

  function getPreviousPeriodTransactions() {
    const currentStart = periodStart();
    const prevStart = new Date(currentStart);
    prevStart.setDate(prevStart.getDate() - periodDays);

    return allTransactions.filter((t) => {
      const time = new Date(t.transaction_date).getTime();
      return time >= prevStart.getTime() && time < currentStart;
    });
  }

  // ==========================================================================
  // AGREGASI HARIAN
  // ==========================================================================

  function buildDaily(txs) {
    const buckets = new Map();

    txs.forEach((row) => {
      const key = isoDateKey(new Date(row.transaction_date));
      if (!buckets.has(key)) {
        buckets.set(key, { sale_date: key, total_transactions: 0, total_revenue: 0, total_items: 0 });
      }
      const b = buckets.get(key);
      b.total_transactions += 1;
      b.total_revenue += Number(row.total_amount || 0);
      b.total_items += Number(row.item_count || 0);
    });

    // Isi hari tanpa transaksi dengan 0 supaya garis grafik tidak terputus.
    const filled = [];
    for (let i = periodDays - 1; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = isoDateKey(d);
      filled.push(
        buckets.get(key) || { sale_date: key, total_transactions: 0, total_revenue: 0, total_items: 0 }
      );
    }

    return filled;
  }

  // ==========================================================================
  // GRAFIK TREN OMZET (line chart)
  // ==========================================================================

  function renderTrendChart(daily) {
    const canvas = document.getElementById('trend-chart');
    const container = document.getElementById('trend-chart-container');
    if (!canvas || !canvas.getContext) return;

    const width = container ? container.clientWidth : 800;
    const height = container ? container.clientHeight : 288;
    canvas.width = Math.max(width, 200);
    canvas.height = Math.max(height, 160);

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const padding = { top: 24, right: 20, bottom: 30, left: 52 };
    const chartW = canvas.width - padding.left - padding.right;
    const chartH = canvas.height - padding.top - padding.bottom;

    const maxVal = Math.max(...daily.map((d) => d.total_revenue), 1) * 1.15;
    const stepX = daily.length > 1 ? chartW / (daily.length - 1) : chartW;

    // Grid + label Y
    ctx.font = '9px Plus Jakarta Sans';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i += 1) {
      const y = padding.top + (chartH * i) / 4;
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(canvas.width - padding.right, y);
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.fillText(compactNumber(maxVal * (1 - i / 4)), padding.left - 6, y + 3);
    }

    // Area gradien di bawah garis
    const points = daily.map((d, i) => ({
      x: padding.left + i * stepX,
      y: padding.top + chartH - (d.total_revenue / maxVal) * chartH,
      value: d.total_revenue,
    }));

    ctx.beginPath();
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.lineTo(points[points.length - 1].x, padding.top + chartH);
    ctx.lineTo(points[0].x, padding.top + chartH);
    ctx.closePath();

    const areaGrad = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
    areaGrad.addColorStop(0, 'rgba(20, 184, 166, 0.28)');
    areaGrad.addColorStop(1, 'rgba(20, 184, 166, 0.02)');
    ctx.fillStyle = areaGrad;
    ctx.fill();

    // Garis
    ctx.beginPath();
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.strokeStyle = '#0f766e';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Titik + label sumbu X (sebagian agar tidak bertabrakan)
    const labelEvery = Math.ceil(daily.length / 8);
    points.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = '#0f766e';
      ctx.lineWidth = 2;
      ctx.stroke();

      if (i % labelEvery === 0 || i === points.length - 1) {
        const parts = daily[i].sale_date.split('-');
        ctx.fillStyle = '#64748b';
        ctx.font = '9px Plus Jakarta Sans';
        ctx.textAlign = 'center';
        ctx.fillText(parts[2] + '/' + parts[1], p.x, canvas.height - 10);
      }
    });

    const cap = document.getElementById('trend-caption');
    if (cap) cap.textContent = `${daily.length} hari terakhir`;
  }

  // ==========================================================================
  // OMZET PER KATEGORI
  // ==========================================================================

  function renderCategoryChart() {
    const ids = getTransactionIdsInPeriod();
    const categoryByProduct = new Map();
    allProducts.forEach((p) => categoryByProduct.set(p.id, p.category_id));

    const totals = new Map();

    allItems.forEach((it) => {
      if (!ids.has(it.transaction_id)) return;
      const catId = categoryByProduct.get(it.product_id);
      totals.set(catId, (totals.get(catId) || 0) + Number(it.subtotal || 0));
    });

    const rows = Array.from(totals.entries())
      .map(([catId, value]) => {
        const cat = allCategories.find((c) => c.id === catId);
        return { id: catId, name: cat ? cat.name : 'Tanpa kategori', value };
      })
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value);

    const grandTotal = rows.reduce((s, r) => s + r.value, 0);

    // --- Daftar breakdown ---
    const listEl = document.getElementById('category-list');
    if (rows.length === 0) {
      listEl.innerHTML = '<p class="text-sm text-slate-500">Belum ada penjualan pada periode ini.</p>';
    } else {
      listEl.innerHTML = rows
        .map((r, idx) => {
          const pct = grandTotal ? (r.value / grandTotal) * 100 : 0;
          const colors = ['#0f766e', '#14b8a6', '#2dd4bf', '#5eead4', '#99f6e4', '#fbbf24'];
          const color = colors[idx % colors.length];
          return `
            <div>
              <div class="flex items-center justify-between text-xs">
                <span class="flex items-center gap-2 font-medium text-slate-700">
                  <span class="h-2.5 w-2.5 rounded-full" style="background:${color}"></span>
                  ${Utils.escapeHtml(r.name)}
                </span>
                <span class="tabular font-bold text-slate-900">${Utils.formatRupiah(r.value)}</span>
              </div>
              <div class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div class="h-full rounded-full" style="width:${pct}%; background:${color}"></div>
              </div>
            </div>`;
        })
        .join('');
    }

    // --- Donut chart ---
    const canvas = document.getElementById('category-chart');
    const container = document.getElementById('category-chart-container');
    if (!canvas || !canvas.getContext) return;

    const size = container ? Math.min(container.clientWidth, 256) : 256;
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);

    if (grandTotal === 0) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px Plus Jakarta Sans';
      ctx.textAlign = 'center';
      ctx.fillText('Belum ada data', size / 2, size / 2);
      return;
    }

    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 12;
    const inner = radius * 0.58;

    const colors = ['#0f766e', '#14b8a6', '#2dd4bf', '#5eead4', '#99f6e4', '#fbbf24', '#f59e0b'];
    let startAngle = -Math.PI / 2;

    rows.forEach((r, idx) => {
      const angle = (r.value / grandTotal) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, startAngle, startAngle + angle);
      ctx.closePath();
      ctx.fillStyle = colors[idx % colors.length];
      ctx.fill();
      startAngle += angle;
    });

    // Lubang tengah
    ctx.beginPath();
    ctx.arc(cx, cy, inner, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();

    // Label total di tengah
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 13px Plus Jakarta Sans';
    ctx.textAlign = 'center';
    ctx.fillText(compactNumber(grandTotal), cx, cy + 4);
  }

  // ==========================================================================
  // PRODUK TERLARIS
  // ==========================================================================

  function renderTopProducts() {
    const ids = getTransactionIdsInPeriod();
    const sales = new Map();

    allItems.forEach((it) => {
      if (!ids.has(it.transaction_id)) return;
      const key = it.product_id ?? it.product_name;
      const prev = sales.get(key) || { name: it.product_name, quantity: 0, revenue: 0 };
      sales.set(key, {
        name: it.product_name || prev.name,
        quantity: prev.quantity + Number(it.quantity || 0),
        revenue: prev.revenue + Number(it.subtotal || 0),
      });
    });

    const ranked = Array.from(sales.values())
      .filter((r) => r.quantity > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 15);

    const loading = document.getElementById('top-loading');
    const wrap = document.getElementById('top-table-wrap');
    const empty = document.getElementById('top-empty');
    const body = document.getElementById('top-table-body');

    if (loading) loading.classList.add('hidden');

    if (ranked.length === 0) {
      if (wrap) wrap.classList.add('hidden');
      if (empty) empty.classList.remove('hidden');
      return;
    }

    if (empty) empty.classList.add('hidden');
    if (wrap) wrap.classList.remove('hidden');

    body.innerHTML = ranked
      .map(
        (r, idx) => `
        <tr>
          <td>
            <div class="flex items-center gap-2.5">
              <span class="w-6 text-center text-xs font-bold text-slate-400">${idx + 1}</span>
              <span class="truncate font-semibold text-slate-900">${Utils.escapeHtml(r.name)}</span>
            </div>
          </td>
          <td class="text-center tabular text-slate-600">${Utils.formatNumber(r.quantity)}</td>
          <td class="text-right font-bold tabular text-slate-900">${Utils.formatRupiah(r.revenue)}</td>
        </tr>`
      )
      .join('');
  }

  // ==========================================================================
  // RENDER ALL
  // ==========================================================================

  function renderAll() {
    const daily = renderSummary();
    renderTrendChart(daily);
    renderCategoryChart();
    renderTopProducts();
  }

  // ==========================================================================
  // EVENT
  // ==========================================================================

  function bindEvents() {
    const group = document.getElementById('period-buttons');
    if (!group) return;

    group.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-period]');
      if (!btn) return;

      periodDays = Number(btn.dataset.period) || 7;

      group.querySelectorAll('[data-period]').forEach((b) => {
        const active = b === btn;
        b.classList.toggle('btn-primary', active);
        b.classList.toggle('btn-secondary', !active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });

      renderAll();
    });

    // Gambar ulang grafik saat ukuran jendela berubah.
    window.addEventListener('resize', Utils.debounce(renderAll, 250));
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

  function compactNumber(n) {
    const v = Number(n) || 0;
    if (v >= 1000000) return 'Rp ' + (v / 1000000).toFixed(1) + 'jt';
    if (v >= 1000) return 'Rp ' + Math.round(v / 1000) + 'rb';
    return 'Rp ' + v;
  }

  // ==========================================================================
  // INIT
  // ==========================================================================

  async function init() {
    bindEvents();
    await loadAll();
    renderAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init };
})();
