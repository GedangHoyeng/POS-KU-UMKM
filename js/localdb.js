/**
 * POS-KU — Database Lokal (Offline / localStorage)
 * ---------------------------------------------------------------
 * File ini adalah ADAPTER CADANGAN yang meniru API Supabase JS.
 * Tujuannya:
 *   1. Aplikasi tetap bisa DEMO dan diuji meski publishable key
 *      Supabase belum diisi.
 *   2. TIDAK mengubah satu baris pun kode modul existing — karena
 *      bentuk panggilannya identik dengan supabase-js:
 *
 *        getSupabase().from('products').select('*').eq('x', 1).order('name')
 *        getSupabase().from('products').insert({ ... })
 *        getSupabase().from('products').update({ ... }).eq('id', 1)
 *        getSupabase().from('products').delete().eq('id', 1)
 *        getSupabase().rpc('process_checkout', { p_items, p_paid })
 *
 *   Semua hasil operasi berbentuk { data, error } dan bisa di-await.
 *
 * MODE OFFLINE AKTIF SECARA OTOMATIS bila validateConfig() gagal.
 * Begitu js/config.js diisi publishable key, aplikasi beralih ke
 * Supabase asli tanpa perlu menyentuh kode lain.
 *
 * DATA DISIMPAN DI: localStorage browser, kunci "posku_db_v1".
 * Menghapus data situs di browser akan mengembalikan data demo.
 */

const LocalDB = (() => {
  // ==========================================================================
  // KONSTANTA & PENYIMPANAN
  // ==========================================================================

  const STORAGE_KEY = 'posku_db_v1';

  /** Nama tabel yang tersedia. */
  const TABLES = [
    'categories',
    'products',
    'transactions',
    'transaction_items',
    'store_profile',
  ];

  /** @type {object|null} database in-memory, dimuat sekali lalu di-cache */
  let cache = null;

  /** ID berikutnya per tabel (meniru identity). */
  let sequences = {};

  // ==========================================================================
  // PENYIMPANAN
  // ==========================================================================

  function load() {
    if (cache) return cache;

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === 1 && parsed.data) {
          cache = parsed.data;
          sequences = parsed.sequences || {};
          return cache;
        }
      }
    } catch (error) {
      console.warn('[POS-KU] Gagal membaca database lokal:', error);
    }

    // Belum ada → isi dengan data demo.
    cache = buildSeedData();
    sequences = computeSequences(cache);
    persist();
    return cache;
  }

  function persist() {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: 1, data: cache, sequences })
      );
    } catch (error) {
      console.warn('[POS-KU] Gagal menyimpan database lokal:', error);
    }
  }

  function computeSequences(db) {
    const seq = {};
    TABLES.forEach((table) => {
      const rows = db[table] || [];
      seq[table] = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1;
    });
    return seq;
  }

  /** Menghapus cache lalu memuat ulang data demo. */
  function reset() {
    cache = null;
    window.localStorage.removeItem(STORAGE_KEY);
    load();
  }

  // ==========================================================================
  // PENYIAPAN DATA DEMO
  // ==========================================================================

  /**
   * Generator angka pseudo-acak yang deterministik (LCP) supaya data demo
   * selalu sama setiap kali aplikasi dibuka — enak untuk presentasi & uji.
   */
  function makeRandom(seed) {
    let state = seed;
    return function next() {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };
  }

  function buildSeedData() {
    const rand = makeRandom(20261004);

    // ---- Kategori ---------------------------------------------------------
    const categoryRows = [
      ['Makanan', 'Makanan siap saji dan hidangan harian'],
      ['Minuman', 'Minuman dingin dan hangat'],
      ['Sembako', 'Kebutuhan pokok rumah tangga'],
      ['Snack', 'Camilan ringan dan manisan'],
      ['Kerajinan', 'Olahan tangan khas daerah'],
      ['Batik', 'Kain dan pakaian batik'],
      ['Lainnya', 'Produk lainnya di luar kategori di atas'],
    ];

    const categories = categoryRows.map(([name, description], index) => ({
      id: index + 1,
      name,
      description,
      created_at: isoDaysAgo(45),
    }));

    const categoryIdByName = {};
    categories.forEach((row) => {
      categoryIdByName[row.name] = row.id;
    });

    // ---- Produk -----------------------------------------------------------
    // [nama, kategori, deskripsi, harga, stok]
    const productSeed = [
      ['Nasi Goreng Spesial', 'Makanan', 'Nasi goreng dengan telur, ayam suwir, dan acar. Tersedia level 1 sampai 3.', 18000, 40],
      ['Mie Goreng Jawa', 'Makanan', 'Mie goreng Jawa khas, sambal ingkring. Level 1 sampai 5.', 16000, 35],
      ['Roti Bakar Cokelat', 'Makanan', 'Roti tawar dibakar dengan cokelat dan keju.', 12000, 25],
      ['Ayam Bakar 1 Ekor', 'Makanan', 'Ayam bakar bumbu kecap, siap saji. Cocok untuk 2 sampai 3 orang.', 35000, 12],
      ['Paket Nasi Praktis', 'Makanan', 'Paket nasi lengkap untuk acara, minimal 5 porsi.', 75000, 5],
      ['Es Teh Manis', 'Minuman', 'Teh dingin dengan gula, es batu, dan lemon.', 5000, 100],
      ['Kopi Susu Gula Aren', 'Minuman', 'Kopi tubruk digiling bar, dicampur susu dan gula aren.', 15000, 50],
      ['Jus Alpukat', 'Minuman', 'Jus alpukat kental dengan susu dan gula.', 18000, 30],
      ['Air Mineral 600ml', 'Minuman', 'Air minum dalam kemasan 600 ml.', 4000, 150],
      ['Es Kelapa Muda', 'Minuman', 'Es kelapa muda segar dengan gula aren.', 20000, 20],
      ['Beras Premium 5kg', 'Sembako', 'Beras Ramos pulen, kemasan 5 kg.', 72000, 24],
      ['Minyak Goreng 1L', 'Sembako', 'Minyak goreng kemasan 1 liter.', 19000, 30],
      ['Gula Pasir 1kg', 'Sembako', 'Gula pasir putih, kemasan 1 kg.', 15500, 28],
      ['Keripik Singkong', 'Snack', 'Keripik singkong asli, kemasan 250 g.', 10000, 40],
      ['Kripik Pisang', 'Snack', 'Kripik pisang asli, kemasan 180 g.', 12000, 35],
      ['Kue Lapis Legit', 'Snack', 'Kue lapis legit yang tabur kelapa parut.', 14000, 18],
      ['Tas Rotan Tangan', 'Kerajinan', 'Tas rotan anyaman tangan dengan warna natural.', 85000, 8],
      ['Tempat Gula Rotan', 'Kerajinan', 'Wadah gula rotan anyaman dengan tutup.', 45000, 12],
      ['Kain Batik Tulis', 'Batik', 'Kain batik tulis motif klasik, panjang 2.5 meter.', 185000, 6],
      ['Baju Kemeja Batik', 'Batik', 'Kemeja batik bahan katun, ukuran L.', 165000, 10],
      ['Tasbih Kayu', 'Lainnya', 'Tasbih kayu dengan 99 butir, cocok untuk hadiah.', 25000, 20],
      ['Gula Aren Cair', 'Lainnya', 'Gula aren cair untukrizzle kue dan minuman.', 28000, 3],
    ];

    const products = productSeed.map(([name, category, description, price, stock], index) => ({
      id: index + 1,
      category_id: categoryIdByName[category],
      name,
      description,
      price,
      stock,
      image_url: null,
      is_active: true,
      created_at: isoDaysAgo(40 - index),
      updated_at: isoDaysAgo(40 - index),
    }));

    // ---- Transaksi demo (14 hari terakhir) --------------------------------
    const transactions = [];
    const transactionItems = [];
    let transactionId = 1;
    let itemId = 1;

    // Bobot popularitas supaya produk]]|produk排行榜]] esgot tidak统一.
    const popularity = products.map(() => 1 + rand() * 6);
    const popularityTotal = popularity.reduce((a, b) => a + b, 0);

    for (let dayOffset = 13; dayOffset >= 0; dayOffset -= 1) {
      const date = new Date();
      date.setDate(date.getDate() - dayOffset);

      // Akhir pekan lebih ramai.
      const weekday = date.getDay();
      const isWeekend = weekday === 0 || weekday === 6;
      const baseCount = isWeekend ? 9 : 5;
      const todayCount = dayOffset === 0 ? 6 : 0;
      const count = baseCount + todayCount + Math.floor(rand() * 4);

      const dailySeq = new Map();

      for (let n = 0; n < count; n += 1) {
        // Jam buka 08:00 - 20:00.
        const hour = 8 + Math.floor(rand() * 12);
        const minute = Math.floor(rand() * 60);
        const at = new Date(date);
        at.setHours(hour, minute, Math.floor(rand() * 60), 0);

        // Pilih 1-4 produk berbeda untuk satu struk.
        const lineCount = 1 + Math.floor(rand() * 4);
        const picked = new Set();
        const lines = [];

        for (let l = 0; l < lineCount; l += 1) {
          // Undian berbobot.
          let ticket = rand() * popularityTotal;
          let productIndex = 0;
          for (let p = 0; p < popularity.length; p += 1) {
            ticket -= popularity[p];
            if (ticket <= 0) {
              productIndex = p;
              break;
            }
          }
          const product = products[productIndex];
          if (picked.has(product.id)) continue;
          picked.add(product.id);

          const quantity = rand() < 0.75 ? 1 : 1 + Math.floor(rand() * 3);
          lines.push({ product, quantity, subtotal: product.price * quantity });
        }

        if (lines.length === 0) continue;

        const total = lines.reduce((sum, line) => sum + line.subtotal, 0);
        const paid = Math.ceil(total / 10000) * 10000;

        const dateKey = isoDateKey(at);
        const nextSeq = (dailySeq.get(dateKey) || 0) + 1;
        dailySeq.set(dateKey, nextSeq);

        const number = `TRX-${dateKey.replace(/-/g, '')}-${String(nextSeq).padStart(4, '0')}`;
        const trxId = transactionId;
        transactionId += 1;

        transactions.push({
          id: trxId,
          transaction_number: number,
          total_amount: total,
          paid_amount: paid,
          change_amount: paid - total,
          item_count: lines.length,
          transaction_date: at.toISOString(),
          created_at: at.toISOString(),
        });

        lines.forEach((line) => {
          transactionItems.push({
            id: itemId,
            transaction_id: trxId,
            product_id: line.product.id,
            product_name: line.product.name,
            price: line.product.price,
            quantity: line.quantity,
            subtotal: line.subtotal,
            created_at: at.toISOString(),
          });
          itemId += 1;
        });
      }
    }

    return {
      categories,
      products,
      transactions,
      transaction_items: transactionItems,
      store_profile: [
        {
          id: 1,
          store_name: 'Toko Berkah Bersama',
          tagline: 'Sembako, makanan, dan kerajinan lokal',
          whatsapp_number: '6281234567890',
          address: 'Jl. Merdeka No. 10, Indonesia',
          created_at: isoDaysAgo(60),
          updated_at: isoDaysAgo(60),
        },
      ],
    };
  }

  function isoDaysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString();
  }

  function isoDateKey(date) {
    // Tanggal lokal komputer sudah cukup untuk data demo.
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate()
    ).padStart(2, '0')}`;
  }

  // ==========================================================================
  // QUERY ENGINE
  // ==========================================================================

  /** Menjalankan seluruh filter, urutan, dan pemotongan baris. */
  function applyQuery(rows, state) {
    let result = rows.slice();

    // Filter utama.
    state.filters.forEach((filter) => {
      result = result.filter((row) => matches(row, filter));
    });

    // Filter setelah select() — dipakai untuk relasi/embed sederhana.
    state.filters.forEach((filter) => {
      result = result.filter((row) => matches(row, filter));
    });

    // Urutkan.
    if (state.orders.length > 0) {
      result.sort((a, b) => {
        for (const order of state.orders) {
          const av = a[order.col];
          const bv = b[order.col];
          if (av === bv) continue;
          const result = av > bv ? 1 : -1;
          return order.asc ? result : -result;
        }
        return 0;
      });
    }

    // Potong baris.
    const from = state.offset || 0;
    const to = state.limit === null ? undefined : from + state.limit;
    result = result.slice(from, to);

    return result;
  }

  function matches(row, filter) {
    const value = row[filter.col];

    switch (filter.op) {
      case 'eq':
        return String(value) === String(filter.val);
      case 'neq':
        return String(value) !== String(filter.val);
      case 'gt':
        return value > filter.val;
      case 'gte':
        return value >= filter.val;
      case 'lt':
        return value < filter.val;
      case 'lte':
        return value <= filter.val;
      case 'like':
        return String(value).includes(String(filter.val).replace(/%/g, ''));
      case 'ilike':
        return String(value).toLowerCase().includes(
          String(filter.val).replace(/%/g, '').toLowerCase()
        );
      case 'in':
        return filter.val.map(String).includes(String(value));
      case 'is':
        return filter.val === null ? value === null || value === undefined : value === filter.val;
      default:
        return true;
    }
  }

  /** Memotong objek hanya pada kolom yang diminta. */
  function project(row, columns) {
    if (!columns || columns === '*') return row;

    const names = columns
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);

    // Dukungan sederhana untuk embed "tabel(kolom)".
    const embedded = names.find((c) => c.includes('('));
    if (embedded && !embedded.includes('count')) {
      const [tableName, innerCols] = embedded.split('(');
      const cleanTable = tableName.trim();
      const cols = innerCols.replace(')', '').trim();

      if (cache[cleanTable]) {
        const related = cache[cleanTable].filter((candidate) =>
          row[cleanTable.replace(/s$/, '_id')] !== undefined
            ? candidate.id === row[cleanTable.replace(/s$/, '_id')]
            : false
        );
        return Object.assign({}, row, {
          [cleanTable]: related.map((r) => project(r, cols)),
        });
      }
    }

    const out = {};
    names.forEach((name) => {
      const [key] = name.split(':');
      out[key] = row[key];
    });
    return out;
  }

  // ==========================================================================
  // VIEW: daily_sales
  // ==========================================================================

  /** Menghitung agregasi penjualan per hari (meniru view di schema.sql). */
  function buildDailySales() {
    const buckets = new Map();

    (cache.transactions || []).forEach((row) => {
      const date = new Date(row.transaction_date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
        date.getDate()
      ).padStart(2, '0')}`;

      if (!buckets.has(key)) {
        buckets.set(key, {
          sale_date: key,
          total_transactions: 0,
          total_revenue: 0,
          total_items: 0,
        });
      }

      const bucket = buckets.get(key);
      bucket.total_transactions += 1;
      bucket.total_revenue += Number(row.total_amount) || 0;
      bucket.total_items += Number(row.item_count) || 0;
    });

    return Array.from(buckets.values()).sort((a, b) =>
      a.sale_date < b.sale_date ? -1 : 1
    );
  }

  // ==========================================================================
  // VALIDASI KONSISTENSI (meniru constraint PostgreSQL)
  // ==========================================================================

  const UNIQUE_INDEXES = {
    categories: ['name'],
    products: ['name'],
    transactions: ['transaction_number'],
  };

  const FOREIGN_KEYS = {
    products: [{ col: 'category_id', table: 'categories' }],
    transaction_items: [
      { col: 'transaction_id', table: 'transactions' },
      { col: 'product_id', table: 'products', nullable: true },
    ],
  };

  function validateRows(table, rows, ignoreIds = []) {
    const uniqueCols = UNIQUE_INDEXES[table];
    if (uniqueCols) {
      uniqueCols.forEach((col) => {
        rows.forEach((row) => {
          if (ignoreIds.includes(row.id)) return;
          if (row[col] === null || row[col] === undefined) return;
          const clash = (cache[table] || []).find(
            (existing) =>
              !ignoreIds.includes(existing.id) &&
              String(existing[col]).toLowerCase() === String(row[col]).toLowerCase()
          );
          if (clash) {
            throw new Error(
              `duplicate key value violates unique constraint "${table}_${col}_key"`
            );
          }
        });
      });
    }

    const fks = FOREIGN_KEYS[table];
    if (fks) {
      fks.forEach((fk) => {
        rows.forEach((row) => {
          const value = row[fk.col];
          if (value === null || value === undefined) {
            if (fk.nullable) return;
            throw new Error(`null value in column "${fk.col}" violates not-null constraint`);
          }
          const exists = (cache[fk.table] || []).some((r) => r.id === value);
          if (!exists) {
            throw new Error(
              `insert or update on table "${table}" violates foreign key constraint ` +
                `(fk_${table}_${fk.col})`
            );
          }
        });
      });
    }
  }

  // ==========================================================================
  // QUERY BUILDER
  // ==========================================================================

  function createQueryBuilder(db, table, viewRows) {
    const state = {
      operation: 'select',
      payload: null,
      selectCols: '*',
      filters: [],
      orders: [],
      limit: null,
      offset: 0,
      singleMode: null,
    };

    const api = {
      select(columns) {
        if (state.operation === 'select') state.selectCols = columns;
        return api;
      },
      insert(payload) {
        state.operation = 'insert';
        state.payload = Array.isArray(payload) ? payload : [payload];
        return api;
      },
      upsert(payload) {
        state.operation = 'upsert';
        state.payload = Array.isArray(payload) ? payload : [payload];
        return api;
      },
      update(payload) {
        state.operation = 'update';
        state.payload = payload;
        return api;
      },
      delete() {
        state.operation = 'delete';
        return api;
      },
      eq: (col, val) => addFilter('eq', col, val),
      neq: (col, val) => addFilter('neq', col, val),
      gt: (col, val) => addFilter('gt', col, val),
      gte: (col, val) => addFilter('gte', col, val),
      lt: (col, val) => addFilter('lt', col, val),
      lte: (col, val) => addFilter('lte', col, val),
      like: (col, val) => addFilter('like', col, val),
      ilike: (col, val) => addFilter('ilike', col, val),
      in: (col, vals) => addFilter('in', col, vals),
      is: (col, val) => addFilter('is', col, val),
      order(col, options) {
        state.orders.push({ col, asc: !options || options.ascending !== false });
        return api;
      },
      limit(count) {
        state.limit = count;
        return api;
      },
      range(from, to) {
        state.offset = from;
        state.limit = to - from + 1;
        return api;
      },
      single() {
        state.singleMode = 'single';
        return api;
      },
      maybeSingle() {
        state.singleMode = 'maybeSingle';
        return api;
      },

      // Membungkus Promise agar bisa di-await seperti supabase-js.
      then(onFulfilled, onRejected) {
        return execute().then(onFulfilled, onRejected);
      },
      catch(onRejected) {
        return execute().catch(onRejected);
      },
      finally(onFinally) {
        return execute().finally(onFinally);
      },
    };

    function addFilter(op, col, val) {
      state.filters.push({ op, col, val });
      return api;
    }

    async function execute() {
      try {
        await Promise.resolve(); // biar konsisten dengan API async Supabase

        const isView = Boolean(viewRows);
        const sourceRows = isView ? viewRows() : db[table];

        if (!isView && !sourceRows) {
          return { data: null, error: { message: `Tabel "${table}" tidak ditemukan.` } };
        }

        switch (state.operation) {
          case 'insert':
            return doInsert(table, state);
          case 'upsert':
            return doUpsert(table, state);
          case 'update':
            return doUpdate(table, state);
          case 'delete':
            return doDelete(table, state);
          default:
            return doSelect(sourceRows, state);
        }
      } catch (error) {
        console.error('[POS-KU] Query lokal gagal:', error);
        return { data: null, error: { message: error.message, code: error.code } };
      }
    }

    return api;
  }

  /** Membungkus hasil: hormati single()/maybeSingle() seperti supabase-js. */
  function wrapResult(rows, singleMode) {
    if (singleMode === 'single') {
      if (rows.length === 0) {
        return { data: null, error: { message: 'Tidak ditemukan satu baris (single).' } };
      }
      return { data: rows[0], error: null };
    }
    if (singleMode === 'maybeSingle') {
      return { data: rows.length > 0 ? rows[0] : null, error: null };
    }
    return { data: rows, error: null };
  }

  function doSelect(sourceRows, state) {
    const rows = applyQuery(sourceRows, state).map((row) => project(row, state.selectCols));
    return wrapResult(rows, state.singleMode);
  }

  function doInsert(table, state) {
    const now = new Date().toISOString();
    const newRows = state.payload.map((input) => ({
      ...input,
      id: input.id !== undefined ? input.id : sequences[table],
    }));

    validateRows(table, newRows);

    newRows.forEach((row) => {
      sequences[table] += 1;
      const enriched = { created_at: now, ...row };
      if ('updated_at' in (cache[table][0] || {})) enriched.updated_at = now;
      cache[table].push(enriched);
    });

    persist();

    return wrapResult(newRows.map((r) => project(r, '*')), state.singleMode);
  }

  function doUpsert(table, state) {
    const now = new Date().toISOString();
    const results = [];

    state.payload.forEach((input) => {
      const existingIndex = cache[table].findIndex((row) => row.id === input.id);
      if (existingIndex >= 0) {
        cache[table][existingIndex] = { ...cache[table][existingIndex], ...input, updated_at: now };
        results.push(cache[table][existingIndex]);
      } else {
        const row = { ...input, id: input.id !== undefined ? input.id : sequences[table] };
        sequences[table] += 1;
        cache[table].push({ created_at: now, ...row });
        results.push(row);
      }
    });

    persist();
    return wrapResult(results.map((r) => project(r, '*')), state.singleMode);
  }

  function doUpdate(table, state) {
    const targets = applyQuery(cache[table], state);
    const targetIds = targets.map((row) => row.id);

    const merged = targets.map((row) => ({ ...row, ...state.payload }));
    validateRows(table, merged, targetIds);

    const now = new Date().toISOString();
    cache[table] = cache[table].map((row) => {
      if (!targetIds.includes(row.id)) return row;
      const next = { ...row, ...state.payload };
      if ('updated_at' in row) next.updated_at = now;
      return next;
    });

    persist();
    return wrapResult(merged.map((r) => project(r, '*')), state.singleMode);
  }

  function doDelete(table, state) {
    const targets = applyQuery(cache[table], state);
    const targetIds = targets.map((row) => row.id);

    // Hapus anak yang bergantung (meniru ON DELETE CASCADE).
    if (table === 'transactions') {
      cache.transaction_items = cache.transaction_items.filter(
        (item) => !targetIds.includes(item.transaction_id)
      );
    }

    cache[table] = cache[table].filter((row) => !targetIds.includes(row.id));
    persist();

    return { data: targets, error: null };
  }

  // ==========================================================================
  // RPC: process_checkout
  // ==========================================================================

  /**
   * Replikasi persis dari Stored Procedure process_checkout di schema.sql:
   *   - Harga SELALU diambil ulang dari tabel products (tidak percaya klien).
   *   - Stok divalidasi dan dikurangi.
   *   - Nomor transaksi harian berurut.
   *   - Satu produk dengan stok kurang => seluruh operasi batal.
   */
  function rpcProcessCheckout({ p_items, p_paid }) {
    const items = Array.isArray(p_items) ? p_items : [];
    const paid = Number(p_paid) || 0;

    if (items.length === 0) {
      throw new Error('Keranjang masih kosong.');
    }
    if (paid <= 0) {
      throw new Error('Uang pelanggan belum diisi.');
    }

    items.forEach((item) => {
      const quantity = parseInt(item.quantity, 10);
      if (Number.isNaN(quantity) || quantity < 1) {
        throw new Error('Jumlah produk minimal 1.');
      }
    });

    let total = 0;
    let itemCount = 0;
    const lines = [];

    items.forEach((item) => {
      const productId = parseInt(item.product_id, 10);
      const quantity = parseInt(item.quantity, 10);

      const product = cache.products.find((p) => p.id === productId);
      if (!product) {
        throw new Error('Produk tidak ditemukan.');
      }
      if (product.is_active === false) {
        throw new Error(`Produk "${product.name}" sedang tidak aktif.`);
      }
      if (product.stock < quantity) {
        throw new Error(
          `Stok produk "${product.name}" tidak mencukupi. ` +
            `Tersedia ${product.stock}, diminta ${quantity}.`
        );
      }

      const subtotal = Number(product.price) * quantity;
      total += subtotal;
      itemCount += 1;
      lines.push({ product, quantity, subtotal });
    });

    if (paid < total) {
      throw new Error('Uang pelanggan kurang dari total transaksi.');
    }

    const change = paid - total;
    const now = new Date();
    const dateKey = isoDateKey(now);
    const todayTransactions = cache.transactions.filter((row) => {
      return isoDateKey(new Date(row.transaction_date)) === dateKey;
    });

    let seq = todayTransactions.length + 1;
    let number = `TRX-${dateKey.replace(/-/g, '')}-${String(seq).padStart(4, '0')}`;
    while (cache.transactions.some((row) => row.transaction_number === number)) {
      seq += 1;
      number = `TRX-${dateKey.replace(/-/g, '')}-${String(seq).padStart(4, '0')}`;
    }

    const transactionId = sequences.transactions;
    sequences.transactions += 1;

    const iso = now.toISOString();

    cache.transactions.push({
      id: transactionId,
      transaction_number: number,
      total_amount: total,
      paid_amount: paid,
      change_amount: change,
      item_count: itemCount,
      transaction_date: iso,
      created_at: iso,
    });

    lines.forEach((line) => {
      const itemId = sequences.transaction_items;
      sequences.transaction_items += 1;

      cache.transaction_items.push({
        id: itemId,
        transaction_id: transactionId,
        product_id: line.product.id,
        product_name: line.product.name,
        price: line.product.price,
        quantity: line.quantity,
        subtotal: line.subtotal,
        created_at: iso,
      });

      line.product.stock -= line.quantity;
      line.product.updated_at = iso;
    });

    persist();

    return {
      transaction_id: transactionId,
      transaction_number: number,
      total_amount: total,
      paid_amount: paid,
      change_amount: change,
      item_count: itemCount,
      change_needed: false,
    };
  }

  // ==========================================================================
  // CLIENT
  // ==========================================================================

  /** Membuat objek klien yang bentuknya sama dengan supabase-js. */
  function createClient() {
    const db = load();

    return {
      /** Penanda bahwa ini mode offline (bisa dipakai modul untuk info UI). */
      isLocalMode: true,

      from(table) {
        if (table === 'daily_sales') {
          return createQueryBuilder(db, table, () => buildDailySales());
        }
        return createQueryBuilder(db, table, null);
      },

      async rpc(name, params) {
        try {
          await Promise.resolve();
          if (name === 'process_checkout') {
            const data = rpcProcessCheckout(params);
            return { data, error: null };
          }
          return { data: null, error: { message: `Fungsi RPC "${name}" tidak dikenal.` } };
        } catch (error) {
          console.error('[POS-KU] RPC lokal gagal:', error);
          return { data: null, error: { message: error.message } };
        }
      },

      auth: {
        getSession() {
          return { data: { session: null }, error: null };
        },
      },
    };
  }

  return { createClient, reset };
})();

// Ekspor ke window agar supabase.js bisa memakainya.
window.LocalDB = LocalDB;
