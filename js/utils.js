/**
 * POS-KU — Utilitas Umum
 * ---------------------------------------------------------------
 * Berisi fungsi pembantu yang dipakai banyak halaman:
 * format angka, escaping teks, toast, modal, validasi form, dan 날짜.
 * Tidak ada akses database di file ini.
 */

const Utils = (() => {
  // ==========================================================================
  // FORMAT
  // ==========================================================================

  /** Format angka menjadi Rupiah: 15000 -> "Rp 15.000" */
  function formatRupiah(value) {
    const number = Number(value) || 0;
    const currency = window.APP_CONFIG?.CURRENCY || 'Rp';
    return `${currency} ${number.toLocaleString('id-ID')}`;
  }

  /** Format angka tanpa simbol mata uang: 15000 -> "15.000" */
  function formatNumber(value) {
    return (Number(value) || 0).toLocaleString('id-ID');
  }

  /**
   * Format tanggal menjadi "2 Oktober 2026, 13:45"
   * @param {string|Date} value Tanggal dari database
   */
  function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';

    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: window.APP_CONFIG?.TIMEZONE || 'Asia/Jakarta',
    }).format(date);
  }

  /** Format tanggal saja: "2 Oktober 2026" */
  function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';

    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: window.APP_CONFIG?.TIMEZONE || 'Asia/Jakarta',
    }).format(date);
  }

  /** Format tanggal ringkas untuk sumbu grafik: "2 Okt" */
  function formatDateShort(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';

    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      timeZone: window.APP_CONFIG?.TIMEZONE || 'Asia/Jakarta',
    }).format(date);
  }

  /** Waktu saat ini dalam zona waktu aplikasi, format ISO */
  function nowISO() {
    return new Date().toISOString();
  }

  /**
   * Menghasilkan tanggal "hari ini" dalam zona waktu aplikasi,
   *Format YYYY-MM-DD (dipakai untuk filter database).
   */
  function todayISO(offsetDays = 0) {
    const now = new Date();
    const tz = window.APP_CONFIG?.TIMEZONE || 'Asia/Jakarta';
    // Ambil tanggal according to zona waktu aplikasi
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const map = {};
    parts.forEach((p) => (map[p.type] = p.value));

    const base = new Date(Number(map.year), Number(map.month) - 1, Number(map.day));
    base.setDate(base.getDate() + offsetDays);
    return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(
      base.getDate()
    ).padStart(2, '0')}`;
  }

  // ==========================================================================
  // KEAMANAN: ESCAPING
  // ==========================================================================

  /**
   * Meloloskan karakter HTML dari teks yang berasal dari database.
   * Wajib dipakai sebelum memasukkan data ke innerHTML (mencegah XSS).
   */
  function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Menghasilkan atribut src yang aman. Hanya izinkan http/https/data gambar.
   * Mencegah javascript: URL yang bisa dieksekusi browser.
   */
  function safeImageUrl(url) {
    if (!url) return '';
    const trimmed = String(url).trim();
    if (/^https?:\/\//i.test(trimmed) || /^data:image\//i.test(trimmed)) return trimmed;
    return '';
  }

  // ==========================================================================
  // NOTIFIKASI (TOAST)
  // ==========================================================================

  /**
   * Menampilkan notifikasi mengambang di pojok layar.
   * @param {string} message Pesan yang ditampilkan
   * @param {'success'|'error'|'info'} type Jenis notifikasi
   */
  function showToast(message, type = 'info') {
    const container = getToastContainer();
    const toast = document.createElement('div');

    const styles = {
      success: {
        bar: 'bg-emerald-500',
        icon: 'M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
      },
      error: {
        bar: 'bg-rose-500',
        icon: 'M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z',
      },
      info: {
        bar: 'bg-brand-600',
        icon: 'M11.25 11.25l.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z',
      },
    };

    const config = styles[type] || styles.info;

    toast.className =
      'pointer-events-auto flex items-start gap-3 w-full max-w-sm rounded-xl border ' +
      'border-slate-200 bg-white p-4 shadow-card-hover animate-slide-in';

    toast.innerHTML = `
      <span class="${config.bar} absolute left-0 top-3 bottom-3 w-1 rounded-full"></span>
      <span class="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${config.bar.replace(
        'bg-',
        'bg-opacity-10 text-'
      )}">
        <svg class="h-5 w-5 text-current ${config.bar.replace('bg-', 'text-')}" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="${config.icon}" />
        </svg>
      </span>
      <div class="flex-1 pt-0.5">
        <p class="text-sm font-medium leading-snug text-slate-800">${escapeHtml(message)}</p>
      </div>
      <button type="button" data-toast-close class="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Tutup notifikasi">
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    `;
    toast.classList.add('relative', 'overflow-hidden');

    toast.querySelector('[data-toast-close]').addEventListener('click', () => removeToast(toast));
    container.appendChild(toast);

    // Hapus otomatis setelah 4 detik.
    setTimeout(() => removeToast(toast), 4000);
  }

  function removeToast(toast) {
    if (!toast || !toast.isConnected) return;
    toast.style.transition = 'opacity .2s ease, transform .2s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(24px)';
    setTimeout(() => toast.remove(), 220);
  }

  function getToastContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className =
        'fixed inset-x-3 top-3 z-[100] flex flex-col gap-2 sm:inset-x-auto sm:right-5 sm:top-5 sm:w-auto';
      container.setAttribute('aria-live', 'polite');
      document.body.appendChild(container);
    }
    return container;
  }

  // ==========================================================================
  // MODAL
  // ==========================================================================

  /**
   * Membuka modal lewat elemen <dialog> (mendukung browser modern).
   * @param {string} selector Selector elemen modal
   */
  function openModal(selector) {
    const modal = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!modal) return null;

    if (typeof modal.showModal === 'function') {
      modal.showModal();
      // Fokuskan elemen pertama agar keyboard dapat digunakan.
      const focusable = modal.querySelector('input, select, textarea, button');
      if (focusable) setTimeout(() => focusable.focus(), 60);
    } else {
      modal.classList.add('flex');
    }
    modal.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
    return modal;
  }

  /** Menutup modal. */
  function closeModal(selector) {
    const modal = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!modal) return;

    if (typeof modal.close === 'function' && modal.open) modal.close();
    modal.classList.remove('modal-open');
    modal.classList.remove('flex');
    document.body.style.overflow = '';
  }

  /**
   * Dialog konfirmasi sederhana (menggantikan window.confirm yang kurang rapi).
   * @param {{title: string, message: string, confirmText?: string, danger?: boolean}} options
   * @returns {Promise<boolean>}
   */
  function confirmDialog({
    title = 'Konfirmasi',
    message = 'Apakah Anda yakin?',
    confirmText = 'Ya, Lanjutkan',
    danger = false,
  } = {}) {
    return new Promise((resolve) => {
      const existing = document.getElementById('confirm-dialog');
      if (existing) existing.remove();

      const dialog = document.createElement('dialog');
      dialog.id = 'confirm-dialog';
      dialog.className =
        'w-[calc(100vw-2rem)] max-w-sm rounded-2xl border border-slate-200 bg-white p-0 ' +
        'shadow-card-hover backdrop:bg-slate-900/40 backdrop:backdrop-blur-sm';

      dialog.innerHTML = `
        <div class="p-6">
          <div class="flex items-start gap-4">
            <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
              danger ? 'bg-rose-50 text-rose-600' : 'bg-brand-50 text-brand-700'
            }">
              <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor">
                ${
                  danger
                    ? '<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/>'
                    : '<path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"/>'
                }
              </svg>
            </span>
            <div class="flex-1">
              <h3 class="text-base font-semibold text-slate-900">${escapeHtml(title)}</h3>
              <p class="mt-1.5 text-sm leading-relaxed text-slate-600">${escapeHtml(message)}</p>
            </div>
          </div>
          <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" data-action="cancel"
              class="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              Batal
            </button>
            <button type="button" data-action="confirm"
              class="rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition ${
                danger
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-brand-700 hover:bg-brand-800'
              }">
              ${escapeHtml(confirmText)}
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(dialog);
      openModal(dialog);

      const finish = (result) => {
        closeModal(dialog);
        dialog.remove();
        resolve(result);
      };

      dialog.querySelector('[data-action="cancel"]').addEventListener('click', () => finish(false));
      dialog.querySelector('[data-action="confirm"]').addEventListener('click', () => finish(true));
      // Batal juga saat menekan Escape atau klik di luar dialog.
      dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        finish(false);
      });
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) finish(false);
      });
    });
  }

  // ==========================================================================
  // FORM & VALIDASI
  // ==========================================================================

  /**
   * Menambahkan validasi real-time pada form: required, min, max, pattern.
   * @param {HTMLFormElement} form
   * @param {Object<string, {required?: boolean, min?: number, max?: number, label?: string, message?: string}>} rules
   */
  function applyValidation(form, rules) {
    if (!form) return;

    const showError = (field, message) => {
      const wrapper = field.closest('[data-field]') || field.parentElement;
      const errorEl = wrapper?.querySelector('[data-error]');
      if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
      }
      field.classList.add('border-rose-400', 'focus:border-rose-400', 'focus:ring-rose-100');
      field.setAttribute('aria-invalid', 'true');
    };

    const clearError = (field) => {
      const wrapper = field.closest('[data-field]') || field.parentElement;
      const errorEl = wrapper?.querySelector('[data-error]');
      if (errorEl) {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
      }
      field.classList.remove('border-rose-400', 'focus:border-rose-400', 'focus:ring-rose-100');
      field.removeAttribute('aria-invalid');
    };

    const validateField = (field) => {
      const rule = rules[field.name];
      if (!rule) return true;

      const label = rule.label || field.dataset.label || 'Data';
      const value = field.type === 'checkbox' ? field.checked : field.value.trim();

      if (rule.required) {
        const empty =
          field.type === 'checkbox'
            ? !field.checked
            : value === '' || value === null || value === undefined;
        if (empty) {
          showError(field, rule.message || `${label} wajib diisi.`);
          return false;
        }
      }

      if (field.type === 'number' || field.type === 'text') {
        if (rule.type === 'number' && value !== '') {
          const num = Number(value);
          if (Number.isNaN(num)) {
            showError(field, `${label} harus berupa angka.`);
            return false;
          }
          if (rule.min !== undefined && num < rule.min) {
            showError(field, rule.minMessage || `${label} minimal ${rule.min}.`);
            return false;
          }
          if (rule.max !== undefined && num > rule.max) {
            showError(field, rule.maxMessage || `${label} maksimal ${rule.max}.`);
            return false;
          }
        }
      }

      clearError(field);
      return true;
    };

    // Validasi saat pengguna mengetik atau memilih.
    Object.keys(rules).forEach((fieldName) => {
      const field = form.elements[fieldName];
      if (!field) return;
      const event = field.tagName === 'SELECT' ? 'change' : 'input';
      field.addEventListener(event, () => validateField(field));
      field.addEventListener('blur', () => validateField(field));
    });

    // Validasi semua saat form dikirim.
    form.addEventListener('submit', (event) => {
      const isValid = Object.keys(rules)
        .map((fieldName) => validateField(form.elements[fieldName]))
        .every(Boolean);

      if (!isValid) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const firstInvalid = form.querySelector('[aria-invalid="true"]');
        if (firstInvalid) firstInvalid.focus();
      }
    });
  }

  /** Menghapus semua tanda error pada sebuah form. */
  function resetValidation(form) {
    if (!form) return;
    form.querySelectorAll('[data-error]').forEach((el) => {
      el.textContent = '';
      el.classList.add('hidden');
    });
    form.querySelectorAll('[aria-invalid]').forEach((el) => {
      el.classList.remove('border-rose-400', 'focus:border-rose-400', 'focus:ring-rose-100');
      el.removeAttribute('aria-invalid');
    });
  }

  // ==========================================================================
  // MISC
  // ==========================================================================

  /** Menunda pemanggilan fungsi (berguna untuk kolom pencarian). */
  function debounce(fn, delay = 350) {
    let timer;
    return function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  /** Menyalin teks ke clipboard dengan fallback untuk browser lama. */
  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      textarea.remove();
      return ok;
    } catch (error) {
      console.error('[POS-KU] Gagal menyalin teks:', error);
      return false;
    }
  }

  /** Menghasilkan URL WhatsApp dengan pesan yang sudah terisi. */
  function buildWhatsAppUrl(number, message) {
    const clean = String(number || '').replace(/[^\d]/g, '');
    return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
  }

  /** Menjalankan aksi saat tombol di dalam elemen diklik. */
  function onDelegatedClick(container, selector, handler) {
    if (!container) return;
    container.addEventListener('click', (event) => {
      const target = event.target.closest(selector);
      if (target && container.contains(target)) handler(event, target);
    });
  }

  return {
    formatRupiah,
    formatNumber,
    formatDateTime,
    formatDate,
    formatDateShort,
    nowISO,
    todayISO,
    escapeHtml,
    safeImageUrl,
    showToast,
    openModal,
    closeModal,
    confirmDialog,
    applyValidation,
    resetValidation,
    debounce,
    copyToClipboard,
    buildWhatsAppUrl,
    onDelegatedClick,
  };
})();
