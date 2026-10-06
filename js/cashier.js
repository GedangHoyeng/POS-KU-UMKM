/**
 * POS-KU — Kasir
 * ---------------------------------------------------------------
 * Tanggung jawab file ini:
 *   1. Memuat produk & kategori dari database
 *   2. Pencarian + filter kategori
 *   3. Keranjang (in-memory, tidak disimpan ke server sebelum bayar)
 *   4. Kalkulasi total, uang pelanggan, kembalian
 *   5. Proses pembayaran lewat RPC process_checkout (atomik, aman)
 *   6. Modal sukses + tautan ke struk
 *
 * Keranjang TIDAK dikirim ke server sampai tombol "Proses Pembayaran" ditekan.
 * Harga yang dikirim juga TIDAK dipercaya — server menghitung ulang dari
 * tabel products (lihat supabase/schema.sql).
 */

const Cashier = (() => {
  // ==========================================================================
  // STATE
  // ==========================================================================

  /** Semua produk aktif dari database (dipakai untuk pencarian instan). */
  let allProducts = [];
  /** Semua kategori dari database. */
  let allCategories = [];
  /** Keranjang: Map<productId, { product, quantity }> */
  const cart = new Map();
  /** Filter kategori yang sedang aktif. null = semua. */
  let activeCategoryId = null;
  /** Kata kunci pencarian. */
  let searchQuery = '';
  /** Elemen DOM (diisi saat init). */
  let els = {};
  /** URL struk transaksi terakhir (diisi saat checkout berhasil). */
  let lastReceiptUrl = '';

  // ==========================================================================
  // MEMUAT DATA
  // ==========================================================================

  async function loadProducts() {
    const grid = els.productGrid;
    grid.innerHTML = skeletonCards(8);

    if (!window.isConfigured) {
      grid.innerHTML = '';
      els.productEmpty.classList.remove('hidden');
      return;
    }

    const { data, error } = await getSupabase()
      .from('products')
      .select('id, name, price, stock, image_url, description, category_id, is_active')
      .eq('is_active', true)
      .order('name');

    if (error) {
      grid.innerHTML = '';
      showLoadError(grid, friendlyError(error), 'produk');
      return;
    }

    allProducts = data || [];
    renderProducts();
  }

  async function loadCategories() {
    if (!window.isConfigured) return;

    const { data, error } = await getSupabase()
      .from('categories')
      .select('id, name')
      .order('name');

    if (error) {
      // Filter kategori bukan fitur kritis; tetap lanjut tanpa chip.
      console.warn('[POS-KU] Gagal memuat kategori:', error);
      return;
    }

    allCategories = data || [];
    renderCategoryChips();
  }

  // ==========================================================================
  // RENDER: PRODUK
  // ==========================================================================

  /** Produk yang cocok dengan pencarian dan filter kategori. */
  function getFilteredProducts() {
    const query = searchQuery.trim().toLowerCase();

    return allProducts.filter((product) => {
      if (activeCategoryId !== null && product.category_id !== activeCategoryId) return false;
      if (query && !String(product.name).toLowerCase().includes(query)) return false;
      return true;
    });
  }

  function renderProducts() {
    const products = getFilteredProducts();
    const grid = els.productGrid;

    if (products.length === 0) {
      grid.innerHTML = '';
      els.productEmpty.classList.remove('hidden');
      return;
    }

    els.productEmpty.classList.add('hidden');
    grid.innerHTML = products.map(productCardTemplate).join('');
  }

  function productCardTemplate(product) {
    const inCart = cart.get(product.id);
    const maxStock = product.stock;
    const isOutOfStock = product.stock <= 0;

    let stockBadge;
    if (isOutOfStock) {
      stockBadge = '<span class="badge-danger">Habis</span>';
    } else if (product.stock <= window.APP_CONFIG.LOW_STOCK_THRESHOLD) {
      stockBadge = `<span class="badge-warning">Sisa ${product.stock}</span>`;
    } else {
      stockBadge = `<span class="badge-success">Stok ${product.stock}</span>`;
    }

    const imageUrl = Utils.safeImageUrl(product.image_url);
    const imageHtml = imageUrl
      ? `<img src="${Utils.escapeHtml(imageUrl)}" alt="${Utils.escapeHtml(product.name)}"
               class="h-full w-full object-cover" loading="lazy"
               onerror="this.parentElement.classList.add('img-fallback'); this.remove();" />`
      : placeholderSvg(product.name);

    const buttonLabel = isOutOfStock
      ? 'Stok Habis'
      : inCart
        ? `Dipilih (${inCart.quantity})`
        : 'Tambah';

    return `
      <article class="card card-hover relative flex flex-col overflow-hidden ${isOutOfStock ? 'opacity-60' : ''}"
               data-product-id="${product.id}">
        <div class="relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200">
          ${imageHtml}
          <div class="absolute left-2 top-2">${stockBadge}</div>
        </div>

        <div class="flex flex-1 flex-col p-3">
          <h3 class="line-clamp-2 text-sm font-bold leading-snug text-slate-900" title="${Utils.escapeHtml(product.name)}">
            ${Utils.escapeHtml(product.name)}
          </h3>
          <p class="mt-1 text-base font-extrabold tabular text-brand-700">
            ${Utils.formatRupiah(product.price)}
          </p>

          <button type="button"
                  class="btn ${isOutOfStock ? 'btn-secondary' : 'btn-primary'} btn-sm mt-auto w-full"
                  data-action="add-to-cart"
                  data-id="${product.id}"
                  ${isOutOfStock ? 'disabled' : ''}
                  aria-label="Tambahkan ${Utils.escapeHtml(product.name)} ke keranjang">
            ${buttonLabel}
          </button>
        </div>
      </article>
    `;
  }

  /** Placeholder bila produk tidak punya gambar. */
  function placeholderSvg(name) {
    const initial = Utils.escapeHtml(String(name || '?').trim().charAt(0).toUpperCase());
    return `
      <div class="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-50 to-brand-100">
        <span class="text-4xl font-extrabold text-brand-400 select-none">${initial}</span>
      </div>
    `;
  }

  function skeletonCards(count) {
    let html = '';
    for (let i = 0; i < count; i += 1) {
      html += `
        <div class="card overflow-hidden">
          <div class="skeleton aspect-[4/3] rounded-none"></div>
          <div class="p-3">
            <div class="skeleton h-4 w-3/4"></div>
            <div class="skeleton mt-2 h-5 w-1/2"></div>
            <div class="skeleton mt-3 h-8 w-full"></div>
          </div>
        </div>
      `;
    }
    return html;
  }

  function showLoadError(container, message, label) {
    container.innerHTML = `
      <div class="card empty-state col-span-full">
        <span class="empty-icon bg-rose-50 text-rose-400">
          <svg class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke-width="1.6" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126Z" />
          </svg>
        </span>
        <h3 class="text-base font-bold text-slate-900">Gagal memuat data ${label}.</h3>
        <p class="mt-1.5 max-w-sm text-sm text-slate-600">${Utils.escapeHtml(message)}</p>
        <button type="button" class="btn-secondary btn-sm mt-5" data-action="retry-products">Coba lagi</button>
      </div>
    `;
  }

  // ==========================================================================
  // RENDER: CHIP KATEGORI
  // ==========================================================================

  function renderCategoryChips() {
    const container = els.categoryChips;

    const allChip = `
      <button type="button"
              class="shrink-0 rounded-full border px-4 py-1.5 text-xs font-semibold transition
                     ${activeCategoryId === null
                        ? 'border-brand-700 bg-brand-700 text-white shadow-sm'
                        : 'border-slate-300 bg-white text-slate-600 hover:border-brand-400 hover:text-brand-700'}"
              data-action="filter-category" data-id="">
        Semua
      </button>
    `;

    const chips = allCategories
      .map((category) => {
        const active = activeCategoryId === category.id;
        return `
          <button type="button"
                  class="shrink-0 whitespace-nowrap rounded-full border px-4 py-1.5 text-xs font-semibold transition
                         ${active
                            ? 'border-brand-700 bg-brand-700 text-white shadow-sm'
                            : 'border-slate-300 bg-white text-slate-600 hover:border-brand-400 hover:text-brand-700'}"
                  data-action="filter-category" data-id="${category.id}">
            ${Utils.escapeHtml(category.name)}
          </button>
        `;
      })
      .join('');

    container.innerHTML = allChip + chips;
  }

  // ==========================================================================
  // KERANJANG
  // ==========================================================================

  /**
   * Menambahkan produk ke keranjang atau menambah jumlahnya.
   * Menolak bila jumlah melebihi stok.
   */
  function addToCart(productId) {
    const product = allProducts.find((p) => p.id === productId);
    if (!product) return;

    if (product.stock <= 0) {
      Utils.showToast('Stok produk habis.', 'error');
      return;
    }

    const existing = cart.get(productId);
    const currentQty = existing ? existing.quantity : 0;

    if (currentQty + 1 > product.stock) {
      Utils.showToast(
        `Stok produk tidak mencukupi. Tersedia ${product.stock} saja.`,
        'error'
      );
      return;
    }

    cart.set(productId, { product, quantity: currentQty + 1 });
    renderCart();
    renderProducts();
  }

  /** Mengubah jumlah item (bisa dipakai untuk tambah/ubah lewat input). */
  function setQuantity(productId, quantity) {
    const product = allProducts.find((p) => p.id === productId);
    if (!product) return;

    if (quantity <= 0) {
      cart.delete(productId);
      renderCart();
      renderProducts();
      return;
    }

    if (quantity > product.stock) {
      Utils.showToast(`Stok tinggal ${product.stock}.`, 'error');
      return;
    }

    cart.set(productId, { product, quantity });
    renderCart();
    renderProducts();
  }

  function changeQuantity(productId, delta) {
    const entry = cart.get(productId);
    if (!entry) return;
    setQuantity(productId, entry.quantity + delta);
  }

  function removeFromCart(productId) {
    cart.delete(productId);
    renderCart();
    renderProducts();
  }

  function clearCart() {
    cart.clear();
    renderCart();
    renderProducts();
    const paidInput = els.paidInput;
    if (paidInput) paidInput.value = '';
  }

  /** Total uang yang harus dibayar. */
  function cartTotal() {
    let total = 0;
    cart.forEach((entry) => {
      total += entry.product.price * entry.quantity;
    });
    return total;
  }

  function cartItemCount() {
    let count = 0;
    cart.forEach((entry) => {
      count += entry.quantity;
    });
    return count;
  }

  function renderCart() {
    const container = els.cartItems;
    const isEmpty = cart.size === 0;

    els.cartEmpty.classList.toggle('hidden', !isEmpty);
    els.cartSummary.classList.toggle('hidden', isEmpty);

    if (isEmpty) {
      container.innerHTML = '';
      els.quickAmounts.innerHTML = '';
      updatePaymentDisplay();
      return;
    }

    // Bentuk daftar item (urut sesuai waktu ditambahkan).
    const entries = Array.from(cart.values());

    container.innerHTML = entries
      .map(({ product, quantity }) => {
        const subtotal = product.price * quantity;
        return `
          <div class="flex items-start gap-3 rounded-xl p-2.5 transition hover:bg-slate-50"
               data-cart-id="${product.id}">
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-semibold text-slate-900">${Utils.escapeHtml(product.name)}</p>
              <p class="mt-0.5 text-xs tabular text-slate-500">${Utils.formatRupiah(product.price)} / item</p>

              <div class="mt-2 flex items-center gap-2">
                <button type="button" class="qty-btn" data-action="qty-dec" data-id="${product.id}"
                        aria-label="Kurangi jumlah">−</button>
                <input type="number" class="qty-input" value="${quantity}" min="1" max="${product.stock}"
                       inputmode="numeric" data-action="qty-input" data-id="${product.id}"
                       aria-label="Jumlah ${Utils.escapeHtml(product.name)}" />
                <button type="button" class="qty-btn" data-action="qty-inc" data-id="${product.id}"
                        aria-label="Tambah jumlah"
                        ${quantity >= product.stock ? 'disabled' : ''}>+</button>

                <span class="ml-auto text-sm font-bold tabular text-slate-900">${Utils.formatRupiah(subtotal)}</span>
              </div>
            </div>

            <button type="button"
                    class="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                    data-action="remove-item" data-id="${product.id}"
                    aria-label="Hapus ${Utils.escapeHtml(product.name)} dari keranjang">
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="1.9" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
            </button>
          </div>
        `;
      })
      .join('');

    // Nominal cepat bergantung pada total, jadi harus ikut di-refresh
    // setiap kali isi keranjang berubah (bukan hanya saat uang diketik).
    renderQuickAmounts();
    updatePaymentDisplay();
  }

  // ==========================================================================
  // PEMBAYARAN & KEMBALIAN
  // ==========================================================================

  function updatePaymentDisplay() {
    const total = cartTotal();
    const count = cartItemCount();
    const paid = Number(els.paidInput.value) || 0;

    els.totalAmount.textContent = Utils.formatRupiah(total);
    els.summarySubtotal.textContent = Utils.formatRupiah(total);
    els.summaryCount.textContent = count;

    // Tombol bayar aktif hanya jika ada item.
    els.btnCheckout.disabled = cart.size === 0;

    // Belum ada uang masuk: sembunyikan kembalian & kekurangan.
    if (paid <= 0) {
      els.changeBox.classList.add('hidden');
      els.changeBox.classList.remove('flex');
      els.changeHint.classList.remove('hidden');
      els.shortageAmount.textContent = Utils.formatRupiah(total);
      els.btnCheckout.disabled = true;
      return;
    }

    if (paid >= total && total > 0) {
      const change = paid - total;
      els.changeBox.classList.remove('hidden');
      els.changeBox.classList.add('flex');
      els.changeBox.className =
        'mt-3 flex items-center justify-between rounded-xl border-2 border-emerald-200 bg-emerald-50 px-4 py-3 transition-all';
      els.changeAmount.className =
        'text-xl font-extrabold tabular text-emerald-700';
      els.changeAmount.textContent = Utils.formatRupiah(change);
      els.changeHint.classList.add('hidden');
      els.btnCheckout.disabled = false;
    } else {
      const shortage = total - paid;
      els.changeBox.classList.add('hidden');
      els.changeBox.classList.remove('flex');
      els.changeHint.classList.remove('hidden');
      els.shortageAmount.textContent = Utils.formatRupiah(shortage);
      els.shortageAmount.className = 'font-semibold text-rose-600';
      els.btnCheckout.disabled = true;
    }
  }

  /** Mengisi tombol nominal cepat (10000, 20000, dst). */
  function renderQuickAmounts() {
    const total = cartTotal();
    if (total <= 0) {
      els.quickAmounts.innerHTML = '';
      return;
    }

    const rounds = [];
    // Kelipatan 5000/10000 terdekat di atas total.
    const step = total > 500000 ? 100000 : 10000;
    const roundedUp = Math.ceil(total / step) * step;
    rounds.push(roundedUp);

    // Uang pas.
    if (roundedUp !== total) rounds.push(total);
    // Bulatan lebih besar (untuk uang kertas umum).
    rounds.push(Math.ceil(total / 50000) * 50000);

    const unique = [...new Set(rounds)].slice(0, 4);

    els.quickAmounts.innerHTML = unique
      .map(
        (amount) => `
          <button type="button"
                  class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold
                         tabular text-slate-600 transition hover:border-brand-400 hover:bg-brand-50
                         hover:text-brand-700"
                  data-action="quick-amount" data-amount="${amount}">
            ${Utils.formatNumber(amount)}
          </button>
        `
      )
      .join('');
  }

  // ==========================================================================
  // CHECKOUT
  // ==========================================================================

  async function processCheckout() {
    // --- Validasi sisi klien (server tetap memvalidasi ulang) -------------
    if (cart.size === 0) {
      Utils.showToast('Keranjang masih kosong.', 'error');
      return;
    }

    const total = cartTotal();
    const paid = Number(els.paidInput.value) || 0;

    if (paid <= 0) {
      Utils.showToast('Uang pelanggan belum diisi.', 'error');
      els.paidInput.focus();
      return;
    }

    if (paid < total) {
      Utils.showToast('Uang pelanggan kurang dari total transaksi.', 'error');
      els.paidInput.focus();
      return;
    }

    // --- Kirim ke server ---------------------------------------------------
    const items = [];
    cart.forEach((entry) => {
      items.push({ product_id: entry.product.id, quantity: entry.quantity });
    });

    const button = els.btnCheckout;
    const originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span class="spinner"></span> Memproses…';

    try {
      const { data, error } = await getSupabase().rpc('process_checkout', {
        p_items: items,
        p_paid: paid,
      });

      if (error) throw error;

      // RPC mengembalikan jsonb — bisa berupa string, tergantung driver.
      const result = typeof data === 'string' ? JSON.parse(data) : data;

      if (!result || !result.transaction_number) {
        throw new Error('Respons server tidak lengkap.');
      }

      onCheckoutSuccess(result);
    } catch (error) {
      const message = friendlyError(error);
      Utils.showToast(message, 'error');

      // Bila stok berubah di server, muat ulang daftar produk.
      if (/Stok|tidak ditemukan|tidak aktif/i.test(message)) {
        await loadProducts();
        // Buang item yang bermasalah agar kasir bisa melanjutkan.
        reconcileCartWithStock();
      }
    } finally {
      button.disabled = false;
      button.innerHTML = originalHtml;
      updatePaymentDisplay();
    }
  }

  /** Menyelaraskan keranjang dengan stok terbaru (setelah gagal checkout). */
  function reconcileCartWithStock() {
    const toDelete = [];
    cart.forEach((entry, id) => {
      const fresh = allProducts.find((p) => p.id === id);
      if (!fresh || fresh.stock <= 0) {
        toDelete.push(id);
      } else if (entry.quantity > fresh.stock) {
        entry.quantity = fresh.stock;
        entry.product = fresh;
      }
    });
    toDelete.forEach((id) => cart.delete(id));
    renderCart();
    renderProducts();
  }

  function onCheckoutSuccess(result) {
    const number = result.transaction_number;
    const total = Number(result.total_amount);
    const change = Number(result.change_amount);

    // Modal sukses.
    els.successNumber.textContent = number;
    els.successTotal.textContent = Utils.formatRupiah(total);
    els.successChange.textContent = Utils.formatRupiah(change);
    lastReceiptUrl = `receipt.html?id=${encodeURIComponent(number)}`;
    try {
      window.sessionStorage.setItem('posku:lastTransactionNumber', number);
    } catch (error) {
      // sessionStorage bisa gagal di mode privat; URL tetap membawa nomor.
    }

    // Reset keranjang.
    cart.clear();
    els.paidInput.value = '';
    renderCart();
    renderProducts();

    // Muat ulang stok dari server (sudah berkurang di database).
    loadProducts();

    Utils.showToast('Transaksi berhasil disimpan.', 'success');
    Utils.openModal(els.successModal);
  }

  // ==========================================================================
  // EVENT
  // ==========================================================================

  function bindEvents() {
    // --- Grid produk (event delegation) ---
    els.productGrid.addEventListener('click', (event) => {
      const addBtn = event.target.closest('[data-action="add-to-cart"]');
      if (addBtn) {
        addToCart(Number(addBtn.dataset.id));
        return;
      }
      const retry = event.target.closest('[data-action="retry-products"]');
      if (retry) loadProducts();
    });

    // --- Chip kategori ---
    els.categoryChips.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-action="filter-category"]');
      if (!chip) return;
      const id = chip.dataset.id ? Number(chip.dataset.id) : null;
      activeCategoryId = id;
      renderCategoryChips();
      renderProducts();
    });

    // --- Pencarian (debounce 250ms) ---
    els.searchInput.addEventListener(
      'input',
      Utils.debounce((event) => {
        searchQuery = event.target.value;
        renderProducts();
      }, 250)
    );

    // --- Keranjang (event delegation) ---
    els.cartItems.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-action]');
      if (!btn) return;
      const id = Number(btn.dataset.id);

      switch (btn.dataset.action) {
        case 'qty-inc':
          changeQuantity(id, 1);
          break;
        case 'qty-dec':
          changeQuantity(id, -1);
          break;
        case 'remove-item':
          removeFromCart(id);
          break;
        default:
          break;
      }
    });

    // Perubahan angka langsung di input jumlah.
    els.cartItems.addEventListener('change', (event) => {
      const input = event.target.closest('[data-action="qty-input"]');
      if (!input) return;
      const id = Number(input.dataset.id);
      const value = parseInt(input.value, 10);
      setQuantity(id, Number.isNaN(value) ? 1 : value);
    });

    // --- Kosongkan keranjang ---
    els.btnClearCart.addEventListener('click', async () => {
      if (cart.size === 0) return;
      const ok = await Utils.confirmDialog({
        title: 'Kosongkan keranjang?',
        message: 'Semua item akan dihapus dari keranjang. Transaksi belum tersimpan.',
        confirmText: 'Kosongkan',
        danger: true,
      });
      if (ok) clearCart();
    });

    // --- Uang pelanggan ---
    els.paidInput.addEventListener('input', () => {
      updatePaymentDisplay();
      renderQuickAmounts();
    });

    // --- Nominal cepat ---
    els.quickAmounts.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-action="quick-amount"]');
      if (!btn) return;
      els.paidInput.value = btn.dataset.amount;
      updatePaymentDisplay();
    });

    // --- Tombol bayar ---
    els.btnCheckout.addEventListener('click', processCheckout);

    // --- Tombol batal ---
    els.btnCancelSale.addEventListener('click', async () => {
      if (cart.size === 0) return;
      const ok = await Utils.confirmDialog({
        title: 'Batalkan transaksi?',
        message: 'Keranjang akan dikosongkan dan transaksi tidak disimpan.',
        confirmText: 'Ya, batalkan',
        danger: true,
      });
      if (ok) clearCart();
    });

    // --- Modal sukses ---
    els.successReceipt.addEventListener('click', () => {
      if (lastReceiptUrl) {
        window.location.href = lastReceiptUrl;
      }
    });

    els.successNew.addEventListener('click', () => {
      Utils.closeModal(els.successModal);
      els.searchInput.focus();
    });

    // Enter pada input uang langsung memproses pembayaran.
    els.paidInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !els.btnCheckout.disabled) {
        processCheckout();
      }
    });
  }

  // ==========================================================================
  // INIT
  // ==========================================================================

  function cacheElements() {
    els = {
      productGrid: document.getElementById('product-grid'),
      productEmpty: document.getElementById('product-empty'),
      categoryChips: document.getElementById('category-chips'),
      searchInput: document.getElementById('search-product'),
      cartItems: document.getElementById('cart-items'),
      cartEmpty: document.getElementById('cart-empty'),
      cartSummary: document.getElementById('cart-summary'),
      clearCart: document.getElementById('clear-cart'),
      btnClearCart: document.getElementById('clear-cart'),
      totalAmount: document.getElementById('total-amount'),
      summarySubtotal: document.querySelector('[data-summary-subtotal]'),
      summaryCount: document.querySelector('[data-summary-count]'),
      paidInput: document.getElementById('paid-input'),
      quickAmounts: document.getElementById('quick-amounts'),
      changeBox: document.getElementById('change-box'),
      changeAmount: document.getElementById('change-amount'),
      changeHint: document.getElementById('change-hint'),
      shortageAmount: document.getElementById('shortage-amount'),
      btnCheckout: document.getElementById('btn-checkout'),
      btnCancelSale: document.getElementById('btn-cancel-sale'),
      successModal: document.getElementById('success-modal'),
      successNumber: document.getElementById('success-number'),
      successTotal: document.getElementById('success-total'),
      successChange: document.getElementById('success-change'),
      successReceipt: document.getElementById('success-receipt'),
      successNew: document.getElementById('success-new'),
    };
  }

  async function init() {
    cacheElements();
    bindEvents();
    renderCart();
    await Promise.all([loadCategories(), loadProducts()]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init };
})();
