-- ============================================================================
--  POS-KU — Point of Sale & Katalog Digital UMKM
--  File  : supabase/schema.sql
--  Tujuan : Membuat struktur database (tabel, relasi, RLS, RPC checkout)
--  Cara   : Buka Supabase Dashboard > SQL Editor > salin seluruh isi file ini
--            > klik "Run". Jalankan file ini SEKALI pada project baru.
--
--  Catatan keamanan:
--    - File ini hanya boleh dijalankan lewat SQL Editor (peran postgres/service_role).
--    - Semua policy di bawah HANYA untuk peran "anon" (publishable key).
--    - service_role TIDAK PERNAH dipakai di frontend.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. AKTIFKAN EKSTENSI (nomor transaksi harian memakai sequence)
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 2. TABEL: categories
--    Kategori produk, contoh: Makanan, Minuman, Batik, dst.
-- ----------------------------------------------------------------------------
create table if not exists public.categories (
  id          bigint generated always as identity primary key,
  name        text        not null unique,
  description text        null,
  created_at  timestamptz not null default now()
);

comment on table  public.categories is 'Kategori produk. Satu produk memiliki satu kategori.';
comment on column public.categories.name    is 'Nama kategori, unik (mis. Minuman).';
comment on column public.categories.description is 'Keterangan singkat kategori.';

-- ----------------------------------------------------------------------------
-- 3. TABEL: products
--    Produk toko. image_url boleh kosong (null = pakai gambar placeholder).
-- ----------------------------------------------------------------------------
create table if not exists public.products (
  id          bigint generated always as identity primary key,
  category_id bigint      null references public.categories (id)
                            on update cascade
                            on delete set null,
  name        text        not null check (length(trim(name)) > 0),
  description text        null,
  -- numeric dipakai untuk uang; float/real bisa menghasilkan galat pembulatan.
  price       numeric(12,2) not null default 0 check (price >= 0),
  stock       integer     not null default 0 check (stock >= 0),
  image_url   text        null,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Nama produk unik agar tidak ada duplikat tidak disengaja.
  constraint products_name_key unique (name)
);

comment on table  public.products is 'Data produk toko. Dikurangi stoknya oleh RPC process_checkout.';
comment on column public.products.price     is 'Harga satuan dalam Rupiah (tanpa titik).';
comment on column public.products.stock     is 'Sisa stok. Tidak boleh minus (CHECK stock >= 0).';
comment on column public.products.is_active is 'false = disembunyikan dari kasir & katalog, tetapi riwayat tetap aman.';

create index if not exists idx_products_category on public.products (category_id);
create index if not exists idx_products_active   on public.products (is_active);
create index if not exists idx_products_name     on public.products (lower(name));

-- Otomatis memperbarui updated_at setiap kali baris diubah.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. TABEL: transactions
--    Header satu struk. Nomornya otomatis dibuat oleh RPC process_checkout.
-- ----------------------------------------------------------------------------
create table if not exists public.transactions (
  id                bigint generated always as identity primary key,
  transaction_number text          not null unique,
  total_amount      numeric(12,2)  not null check (total_amount >= 0),
  paid_amount       numeric(12,2)  not null check (paid_amount  >= 0),
  change_amount     numeric(12,2)  not null check (change_amount >= 0),
  -- Disimpan agar kartu statistik tidak perlu COUNT(*) setiap kali dimuat.
  item_count        integer       not null default 0 check (item_count >= 0),
  transaction_date  timestamptz   not null default now(),
  created_at        timestamptz   not null default now(),
  -- Kembalian harus sama dengan uang dikurangi total.
  constraint transactions_change_check
    check (change_amount = paid_amount - total_amount)
);

comment on table public.transactions is 'Header transaksi/penjualan. Satu baris = satu struk.';

create index if not exists idx_transactions_date  on public.transactions (transaction_date desc);
create index if not exists idx_transactions_no    on public.transactions (transaction_number desc);

-- ----------------------------------------------------------------------------
-- 5. TABEL: transaction_items
--    Detail isi struk.
--    product_name & price DISALIN dengan sengaja (denormalisasi) supaya struk
--    lama tidak berubah walaupun produk di-edit atau di-hapus nanti.
-- ----------------------------------------------------------------------------
create table if not exists public.transaction_items (
  id             bigint generated always as identity primary key,
  transaction_id bigint        not null references public.transactions (id)
                               on update cascade
                               on delete cascade,
  product_id     bigint        null references public.products (id)
                               on update cascade
                               on delete set null,
  product_name   text          not null,
  price          numeric(12,2) not null check (price >= 0),
  quantity       integer       not null check (quantity > 0),
  subtotal       numeric(12,2) not null check (subtotal >= 0),
  created_at     timestamptz   not null default now()
);

comment on table public.transaction_items is 'Detail item struk. Dipakai untuk cetak struk & produk terlaris.';

create index if not exists idx_items_transaction on public.transaction_items (transaction_id);
create index if not exists idx_items_product     on public.transaction_items (product_id);

-- ----------------------------------------------------------------------------
-- 6. TABEL: store_profile
--    Identitas toko untuk katalog & struk. SINGLE STORE: selalu id = 1.
--    Tidak ada tabel "stores" yang bisa berisi banyak tenant.
-- ----------------------------------------------------------------------------
create table if not exists public.store_profile (
  id              bigint generated always as identity primary key,
  store_name      text        not null default 'Toko Saya',
  tagline         text        null,
  whatsapp_number text        null,   -- format internasional tanpa "+", mis. 6281234567890
  address         text        null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint store_profile_single_row check (id = 1)
);

comment on table public.store_profile is 'Identitas satu toko (single store). Selalu 1 baris dengan id = 1.';

drop trigger if exists trg_store_profile_updated_at on public.store_profile;
create trigger trg_store_profile_updated_at
  before update on public.store_profile
  for each row execute function public.set_updated_at();

-- Baris default (dapat diubah lewat SQL Editor).
insert into public.store_profile (id, store_name, tagline, whatsapp_number, address)
overriding system value
values (1, 'Toko Berkah Bersama',
        'Sembako, makanan, dan kerajinan lokal',
        '6285723052692',
        'Jl. Merdeka No. 10, Indonesia')
on conflict (id) do nothing;

-- ============================================================================
-- 7. STORED PROCEDURE: process_checkout  (inti keamanan transaksi)
-- ----------------------------------------------------------------------------
--  Dipanggil dari frontend lewat supabase.rpc('process_checkout', ...)
--
--  Mengapa Stored Procedure dan bukan 3 request terpisah?
--    3 request terpisah bisa gagal di tengah (mis. stok ter-update tapi detail
--    item gagal) sehingga transaksi & stok jadi tidak sinkron.
--    Dengan RPC, semua langkah berjalan dalam SATU transaksi database:
--    bila ada satu item kurang stok => seluruh operasi ROLLBACK.
--
--  Yang dilakukan di dalam server:
--    1. Lock baris produk (FOR UPDATE) supaya 2 kasir tidak bentrok.
--    2. Hitung ULANG subtotal & total dari harga ASLI di database.
--       -> harga yang dikirim browser TIDAK dipercaya.
--    3. Simpan header transaksi + nomor nota.
--    4. Simpan detail item.
--    5. Kurangi stok.
--
--  Return: json { transaction_id, transaction_number, total_amount,
--                  paid_amount, change_amount, item_count, change_needed }
--  Error : raise exception dengan pesan ramah Bahasa Indonesia.
-- ============================================================================
create or replace function public.process_checkout(
  p_items jsonb,   -- [{ "product_id": 1, "quantity": 2 }, ...]
  p_paid  numeric  -- uang yang dibayar pelanggan
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item        record;
  v_product     record;
  v_el          jsonb;
  v_total       numeric(12,2) := 0;
  v_item_count  integer      := 0;
  v_change      numeric(12,2);
  v_seq         bigint;
  v_trx_id      bigint;
  v_trx_no      text;
  v_subtotal    numeric(12,2);
  v_units       integer;
  v_today       date := (now() at time zone 'Asia/Jakarta')::date;
begin
  -- 0) Validasi input dasar -----------------------------------------------
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Keranjang masih kosong.';
  end if;

  if p_paid is null or p_paid <= 0 then
    raise exception 'Uang pelanggan belum diisi.';
  end if;

  for v_el in select value from jsonb_array_elements(p_items)
  loop
    -- Jumlah harus bilangan bulat positif.
    if (v_el ->> 'quantity')::int is null
       or (v_el ->> 'quantity')::int < 1 then
      raise exception 'Jumlah produk minimal 1.';
    end if;
  end loop;

  -- 1) Kunci baris produk, validasi stok, hitung total dari harga database --
  for v_el in select value from jsonb_array_elements(p_items)
  loop
    -- FOR UPDATE mencegah dua kasir mengurangi stok produk yang sama sekaligus.
    select id, name, price, stock, is_active
      into v_product
      from public.products
     where id = (v_el ->> 'product_id')::bigint
       for update;

    if not found then
      raise exception 'Produk tidak ditemukan.';
    end if;

    if v_product.is_active = false then
      raise exception 'Produk "%" sedang tidak aktif.', v_product.name;
    end if;

    -- Stok tidak boleh melebihi jumlah yang diminta.
    if v_product.stock < (v_el ->> 'quantity')::int then
      raise exception 'Stok produk "%" tidak mencukupi. Tersedia %, diminta %.',
        v_product.name, v_product.stock, (v_el ->> 'quantity')::int;
    end if;

    -- Harga SELALU dari database, bukan dari nilai yang dikirim browser.
    v_units    := (v_el ->> 'quantity')::int;
    v_subtotal := v_product.price * v_units;
    v_total    := v_total + v_subtotal;
    v_item_count := v_item_count + 1;
  end loop;

  -- 2) Validasi pembayaran --------------------------------------------------
  if p_paid < v_total then
    raise exception 'Uang pelanggan kurang dari total transaksi.';
  end if;

  v_change := p_paid - v_total;

  -- 3) Nomor transaksi unik harian: TRX-YYYYMMDD-0001 -------------------
  select count(*) + 1 into v_seq
    from public.transactions
   where (transaction_date at time zone 'Asia/Jakarta')::date = v_today;

  -- Loop kecil sebagai pengaman bila ada nomor bentrok di detik yang sama.
  while exists (
    select 1 from public.transactions
     where transaction_number = 'TRX-' || to_char(v_today,'YYYYMMDD') || '-' || lpad(v_seq::text,4,'0')
  ) loop
    v_seq := v_seq + 1;
  end loop;

  v_trx_no := 'TRX-' || to_char(v_today,'YYYYMMDD') || '-' || lpad(v_seq::text,4,'0');

  -- 4) Simpan header transaksi -------------------------------------------
  insert into public.transactions
    (transaction_number, total_amount, paid_amount, change_amount, item_count, transaction_date)
  values
    (v_trx_no, v_total, p_paid, v_change, v_item_count, now())
  returning id into v_trx_id;

  -- 5) Simpan detail item & kurangi stok ---------------------------------
  for v_el in select value from jsonb_array_elements(p_items)
  loop
    select id, name, price, stock
      into v_product
      from public.products
     where id = (v_el ->> 'product_id')::bigint;

    v_units := (v_el ->> 'quantity')::int;

    insert into public.transaction_items
      (transaction_id, product_id, product_name, price, quantity, subtotal)
    values
      (v_trx_id, v_product.id, v_product.name, v_product.price, v_units,
       v_product.price * v_units);

    -- Pengecekan ulang: jaring pengaman kedua agar stok tidak pernah minus.
    update public.products
       set stock = stock - v_units
     where id = v_product.id
       and stock >= v_units;

    if not found then
      raise exception 'Stok produk "%" tidak mencukupi.', v_product.name;
    end if;
  end loop;

  -- 6) Kembalikan hasil ke frontend --------------------------------------
  return jsonb_build_object(
    'transaction_id',     v_trx_id,
    'transaction_number', v_trx_no,
    'total_amount',       v_total,
    'paid_amount',        p_paid,
    'change_amount',      v_change,
    'item_count',         v_item_count,
    'change_needed',      false
  );
end;
$$;

-- Izinkan peran anon memanggil RPC ini lewat PostgREST.
grant execute on function public.process_checkout(jsonb, numeric) to anon, authenticated;

-- ============================================================================
-- 8. ROW LEVEL SECURITY (RLS)
--    Diaktifkan untuk semua tabel. MVP single-store tanpa login, sehingga
--    peran "anon" (publishable key) boleh membaca dan menulis data toko.
--    store_profile hanya boleh dibaca.
--    >> Jika nanti ditambah Login Admin, ubah policy ini menjadi
--       "auth.role() = 'authenticated'" (lihat README bagian Keamanan).
-- ============================================================================

alter table public.categories         enable row level security;
alter table public.products           enable row level security;
alter table public.transactions       enable row level security;
alter table public.transaction_items  enable row level security;
alter table public.store_profile      enable row level security;

-- categories -----------------------------------------------------------------
drop policy if exists "anon_read_categories" on public.categories;
create policy "anon_read_categories" on public.categories
  for select to anon using (true);

drop policy if exists "anon_insert_categories" on public.categories;
create policy "anon_insert_categories" on public.categories
  for insert to anon with check (true);

drop policy if exists "anon_update_categories" on public.categories;
create policy "anon_update_categories" on public.categories
  for update to anon using (true) with check (true);

drop policy if exists "anon_delete_categories" on public.categories;
create policy "anon_delete_categories" on public.categories
  for delete to anon using (true);

-- products -------------------------------------------------------------------
drop policy if exists "anon_read_products" on public.products;
create policy "anon_read_products" on public.products
  for select to anon using (true);

drop policy if exists "anon_insert_products" on public.products;
create policy "anon_insert_products" on public.products
  for insert to anon with check (true);

drop policy if exists "anon_update_products" on public.products;
create policy "anon_update_products" on public.products
  for update to anon using (true) with check (true);

drop policy if exists "anon_delete_products" on public.products;
create policy "anon_delete_products" on public.products
  for delete to anon using (true);

-- transactions ---------------------------------------------------------------
drop policy if exists "anon_read_transactions" on public.transactions;
create policy "anon_read_transactions" on public.transactions
  for select to anon using (true);

drop policy if exists "anon_insert_transactions" on public.transactions;
create policy "anon_insert_transactions" on public.transactions
  for insert to anon with check (true);

-- transaction_items ----------------------------------------------------------
drop policy if exists "anon_read_transaction_items" on public.transaction_items;
create policy "anon_read_transaction_items" on public.transaction_items
  for select to anon using (true);

drop policy if exists "anon_insert_transaction_items" on public.transaction_items;
create policy "anon_insert_transaction_items" on public.transaction_items
  for insert to anon with check (true);

-- store_profile (hanya baca) -------------------------------------------------
drop policy if exists "anon_read_store_profile" on public.store_profile;
create policy "anon_read_store_profile" on public.store_profile
  for select to anon using (true);

-- ============================================================================
-- 9. VIEW BANTUAN: laporan penjualan harian
--    Memudahkan halaman Dashboard & Laporan tanpa logika berulang di frontend.
-- ============================================================================
create or replace view public.daily_sales as
select
  (transaction_date at time zone 'Asia/Jakarta')::date as sale_date,
  count(*)::int                                   as total_transactions,
  sum(total_amount)                               as total_revenue,
  sum(item_count)                                 as total_items
from public.transactions
group by (transaction_date at time zone 'Asia/Jakarta')::date;

grant select on public.daily_sales to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Selesai. Lanjutkan dengan supabase/seed.sql untuk data demo.
-- ----------------------------------------------------------------------------
