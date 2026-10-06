/**
 * POS-KU — E2E Test: Checkout → Transaksi Berhasil → Lihat Struk → receipt.html
 * ------------------------------------------------------------------------
 * Alur yang diuji (meniru perilaku pengguna nyata, BUKAN memanggil fungsi JS):
 *   1. Buka cashier.html
 *   2. Klik tombol "Tambah" pada produk (membangun keranjang)
 *   3. Isi #paid-input dengan nominal valid (event input sungguhan)
 *   4. Klik #btn-checkout
 *   5. Tunggu modal "Transaksi Berhasil" muncul
 *   6. Klik tombol "Lihat Struk" (#success-receipt) secara nyata via automation API
 *   7. Verifikasi navigasi ke receipt.html + nomor transaksi terkirim
 *   8. Verifikasi data transaksi tampil di halaman struk
 *   9. Kumpulkan console error / request gagal / pageerror
 *
 * PENTING: Semua interaksi memakai selector DOM (#paid-input, #btn-checkout,
 * #success-receipt) + page.click() / page.type() Puppeteer — TIDAK ada
 * koordinat layar, TIDAK ada pemanggilan fungsi JS langsung.
 *
 * Cara jalan:  node e2e-receipt.test.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 4173);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// ---------------------------------------------------------------------------
// STATIC SERVER (supaya halaman berjalan di origin http, bukan file://)
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
      if (!filePath.startsWith(ROOT)) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found: ' + urlPath);
          return;
        }
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
          'Cache-Control': 'no-store',
        });
        res.end(data);
      });
    });
    server.listen(PORT, () => resolve(server));
  });
}

// ---------------------------------------------------------------------------
// UTILITAS PELAPORAN
// ---------------------------------------------------------------------------
const log = (...args) => console.log(...args);
const h1 = (t) => log('\n' + '='.repeat(64) + '\n' + t + '\n' + '='.repeat(64));

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok: !!ok, detail });
  log(`  ${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ` -> ${detail}` : ''}`);
  return ok;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error('Browser tidak ditemukan. Set CHROME_PATH.');
}

// ---------------------------------------------------------------------------
// UJI UTAMA
// ---------------------------------------------------------------------------
async function main() {
  const server = await startServer();
  const browserPath = findChrome();
  log('Browser  : ' + browserPath);
  log('Base URL : ' + BASE_URL);

  const browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900'],
    defaultViewport: { width: 1440, height: 900 },
  });

  const page = await browser.newPage();

  // --- Kumpulkan diagnostik ---------------------------------------------
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
    log(`  [console.${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
    log(`  [pageerror] ${err.message}`);
  });
  page.on('requestfailed', (req) => {
    const msg = `${req.method()} ${req.url()} :: ${req.failure() && req.failure().errorText}`;
    failedRequests.push(msg);
    log(`  [requestfailed] ${msg}`);
  });
  page.on('response', (res) => {
    if (res.status() >= 400) {
      const msg = `${res.status()} ${res.url()}`;
      failedRequests.push(msg);
      log(`  [http>=400] ${msg}`);
    }
  });

  // ======================================================================
  h1('TAHAP 1 — Buka cashier.html & pastikan produk termuat');
  // ======================================================================
  await page.goto(`${BASE_URL}/cashier.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#product-grid [data-action="add-to-cart"]', { timeout: 30000 });
  const productCount = await page.$$eval('#product-grid [data-action="add-to-cart"]', (n) => n.length);
  check('Produk tampil di grid kasir', productCount > 0, `${productCount} produk`);

  const mode = await page.evaluate(() => ({
    configured: !!window.isConfigured,
    offline: !!window.isOfflineMode,
    initError: window.SUPABASE_INIT_ERROR || '',
  }));
  log('  Mode database:', JSON.stringify(mode));
  check('Database terkonfigurasi (window.isConfigured)', mode.configured, JSON.stringify(mode));

  // ======================================================================
  h1('TAHAP 2 — Tambah 2 produk ke keranjang (klik nyata per produk)');
  // ======================================================================
  // CATATAN: renderProducts() mengganti innerHTML grid setiap kali produk
  // ditambahkan, sehingga handle DOM lama menjadi detached. Karena itu kita
  // SELALU query ulang tombol baru setelah setiap klik.
  async function addProductByIndex(idx) {
    await page.waitForSelector('#product-grid [data-action="add-to-cart"]', { timeout: 10000 });
    const buttons = await page.$$('#product-grid [data-action="add-to-cart"]');
    const label = await buttons[idx].evaluate((b) => b.textContent.trim());
    await buttons[idx].click();
    await sleep(300); // tunggu re-render
    return label;
  }

  const p1 = await addProductByIndex(0);
  const p2 = await addProductByIndex(1);
  log(`  Produk ditambahkan: "${p1}", "${p2}"`);

  await page.waitForSelector('#cart-summary:not(.hidden)', { timeout: 10000 });
  const totalText = await page.$eval('#total-amount', (el) => el.textContent.trim());
  const totalNumber = Number(totalText.replace(/[^0-9]/g, ''));
  check('Keranjang terisi & total terhitung', totalNumber > 0, `${totalText} (${totalNumber})`);

  // ======================================================================
  h1('TAHAP 3 — Isi #paid-input dengan nominal valid (event input sungguhan)');
  // ======================================================================
  const paidAmount = Math.ceil((totalNumber + 20000) / 10000) * 10000;

  // page.type() mengirim key event sungguhan -> memicu listener 'input'.
  await page.click('#paid-input', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type('#paid-input', String(paidAmount), { delay: 20 });
  await sleep(300);

  const paidValue = await page.$eval('#paid-input', (el) => el.value);
  const checkoutDisabled = await page.$eval('#btn-checkout', (el) => el.disabled);
  check('#paid-input berisi nominal valid', Number(paidValue) === paidAmount, `value="${paidValue}"`);
  check('#btn-checkout aktif setelah uang >= total', checkoutDisabled === false, `disabled=${checkoutDisabled}`);

  // ======================================================================
  h1('TAHAP 4 — Klik #btn-checkout & tunggu modal "Transaksi Berhasil"');
  // ======================================================================
  await page.click('#btn-checkout');
  await page.waitForSelector('#success-modal[open]', { timeout: 30000 });
  await page.waitForFunction(
    () => {
      const el = document.getElementById('success-number');
      return el && el.textContent.trim() && el.textContent.trim() !== '-';
    },
    { timeout: 30000 }
  );

  const successInfo = await page.evaluate(() => ({
    number: document.getElementById('success-number') && document.getElementById('success-number').textContent.trim(),
    total: document.getElementById('success-total') && document.getElementById('success-total').textContent.trim(),
    change: document.getElementById('success-change') && document.getElementById('success-change').textContent.trim(),
    modalOpen: document.getElementById('success-modal') && document.getElementById('success-modal').open === true,
    heading: document.querySelector('#success-modal h2') && document.querySelector('#success-modal h2').textContent.trim(),
  }));
  log('  Modal sukses:', JSON.stringify(successInfo));
  check('Modal "Transaksi Berhasil" terbuka', successInfo.modalOpen === true);
  check('Judul modal benar', successInfo.heading === 'Transaksi Berhasil', successInfo.heading);
  check('Nomor transaksi tampil di modal', /^TRX-/i.test(successInfo.number || ''), successInfo.number);

  const txNumber = successInfo.number;

  // ======================================================================
  h1('TAHAP 5 — Klik tombol "Lihat Struk" (perilaku nyata, bukan fungsi JS)');
  // ======================================================================
  const btnInfo = await page.evaluate(() => {
    const btn = document.getElementById('success-receipt');
    if (!btn) return { found: false };
    const r = btn.getBoundingClientRect();
    const cs = getComputedStyle(btn);
    return {
      found: true,
      text: btn.textContent.replace(/\s+/g, ' ').trim(),
      type: btn.tagName,
      disabled: btn.disabled,
      rect: { w: r.width, h: r.height },
      visibility: cs.visibility,
      pointerEvents: cs.pointerEvents,
    };
  });
  log('  Tombol "Lihat Struk":', JSON.stringify(btnInfo));
  check(
    'Tombol "Lihat Struk" ditemukan & terlihat',
    !!btnInfo.found && btnInfo.rect.w > 0 && (btnInfo.text || '').includes('Lihat Struk')
  );

  // Diagnostik listener via CDP (bukan memanggil handler-nya).
  try {
    const cdp = await page.createCDPSession();
    const { result } = await cdp.send('Runtime.evaluate', {
      objectGroup: 'e2e',
      expression: `document.getElementById('success-receipt')`,
    });
    const listeners = await cdp.send('DOMDebugger.getEventListeners', {
      objectId: result.objectId,
    });
    const kinds = (listeners.listeners || []).map((l) => l.type);
    log('  Event listener pada tombol:', JSON.stringify(kinds));
    check('Tombol punya event listener "click"', kinds.includes('click'));
  } catch (e) {
    log('  [warn] gagal inspeksi listener:', e.message);
  }

  const urlBefore = page.url();
  log('  URL SEBELUM klik:', urlBefore);

  // Klik nyata via automation API (page.click = trusted input pada center elemen).
  const navPromise = page
    .waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 })
    .then((r) => r && r.url())
    .catch(() => null);
  await page.click('#success-receipt');
  const navUrl = await navPromise;

  // Beri waktu render penuh.
  await sleep(1200);

  const urlAfter = page.url();
  log('  URL SESUDAH klik:', urlAfter);
  if (navUrl) log('  URL dari waitForNavigation:', navUrl);

  check('Navigasi terjadi setelah klik "Lihat Struk"', /receipt\.html/i.test(urlAfter), urlAfter);

  // ======================================================================
  h1('TAHAP 6 — Verifikasi halaman receipt.html & data transaksi');
  // ======================================================================
  const receiptUrl = new URL(urlAfter);
  check('File halaman adalah receipt.html', /receipt\.html$/i.test(receiptUrl.pathname), receiptUrl.pathname);
  check(
    'Nomor transaksi terkirim sebagai parameter ?id=',
    receiptUrl.searchParams.get('id') === txNumber,
    `id="${receiptUrl.searchParams.get('id')}" (diharapkan "${txNumber}")`
  );

  // Tunggu render struk selesai.
  await page
    .waitForFunction(
      () => {
        const n = document.getElementById('receipt-number');
        const root = document.getElementById('receipt-root');
        const notFound = document.getElementById('receipt-not-found');
        if (!n) return false;
        if (notFound && !notFound.classList.contains('hidden')) return true;
        return n.textContent.trim() && n.textContent.trim() !== '-' && root && !root.classList.contains('hidden');
      },
      { timeout: 25000 }
    )
    .catch(() => {});

  const receiptData = await page.evaluate(() => {
    const txt = (id) => {
      const el = document.getElementById(id);
      return el ? el.textContent.trim() : null;
    };
    const notFound = document.getElementById('receipt-not-found');
    const p = notFound ? notFound.querySelector('p') : null;
    return {
      title: document.title,
      store: txt('receipt-store-name'),
      number: txt('receipt-number'),
      date: txt('receipt-date'),
      total: txt('receipt-total'),
      paid: txt('receipt-paid'),
      change: txt('receipt-change'),
      items: Array.from(document.querySelectorAll('#receipt-items > div')).map((d) =>
        d.textContent.replace(/\s+/g, ' ').trim()
      ),
      notFoundVisible: notFound ? !notFound.classList.contains('hidden') : false,
      notFoundMessage: p ? p.textContent.trim() : '',
    };
  });

  log('\n  DATA STRUK TERBACA DARI DOM:');
  log(JSON.stringify(receiptData, null, 2));

  check(
    'Halaman struk TIDAK menampilkan "tidak ditemukan"',
    receiptData.notFoundVisible === false,
    receiptData.notFoundVisible ? receiptData.notFoundMessage : ''
  );
  check(
    'Nomor transaksi di struk sama dengan transaksi checkout',
    receiptData.number === txNumber,
    `${receiptData.number} vs ${txNumber}`
  );
  check('Total transaksi tampil', /[1-9]/.test(receiptData.total || ''), receiptData.total);
  check('Uang dibayar tampil', /[1-9]/.test(receiptData.paid || ''), receiptData.paid);
  check('Kembalian tampil', !!receiptData.change, receiptData.change);
  check('Daftar item transaksi tampil', receiptData.items.length > 0, `${receiptData.items.length} item`);
  check('Judul halaman memakai nomor struk', (receiptData.title || '').includes(txNumber || 'x'), receiptData.title);

  // Konsistensi total: total struk harus sama dengan total di modal kasir.
  const normNum = (s) => Number(String(s || '').replace(/[^0-9]/g, ''));
  check(
    'Total struk konsisten dengan modal kasir',
    normNum(receiptData.total) === normNum(successInfo.total),
    `${receiptData.total} vs ${successInfo.total}`
  );

  // ======================================================================
  h1('TAHAP 7 — Laporan diagnostik error');
  // ======================================================================
  const relevantConsoleErrors = consoleErrors.filter(
    (e) => !/favicon|fonts\.googleapis|fonts\.gstatic/i.test(e)
  );
  log('  console error :', relevantConsoleErrors.length);
  relevantConsoleErrors.forEach((e) => log('     - ' + e));
  log('  page errors   :', pageErrors.length);
  pageErrors.forEach((e) => log('     - ' + e));
  log('  request gagal :', failedRequests.length);
  failedRequests.forEach((e) => log('     - ' + e));

  check('Tidak ada pageerror (uncaught exception)', pageErrors.length === 0, pageErrors.join(' | '));
  check('Tidak ada console error relevan', relevantConsoleErrors.length === 0, relevantConsoleErrors.join(' | '));
  const relevantFailed = failedRequests.filter((f) => !/favicon|fonts\./i.test(f));
  check('Tidak ada request data yang gagal', relevantFailed.length === 0, relevantFailed.join(' | '));

  // ======================================================================
  h1('RINGKASAN');
  // ======================================================================
  const failed = checks.filter((c) => !c.ok);
  log(`  URL sebelum klik : ${urlBefore}`);
  log(`  URL sesudah klik : ${urlAfter}`);
  log(`  Nomor transaksi  : ${txNumber}`);
  log(
    `  Total            : ${checks.length} pemeriksaan, ${checks.length - failed.length} pass, ${failed.length} fail`
  );
  if (failed.length) {
    log('\n  PEMERIKSAAN GAGAL:');
    failed.forEach((f) => log(`   x ${f.name} :: ${f.detail}`));
  }

  await browser.close();
  server.close();
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error('\nFATAL:', err);
  process.exit(2);
});
