-- ============================================================================
--  POS-KU — Data Demo
--  File  : supabase/seed.sql
--  Tujuan : Mengisi kategori + produk contoh agar aplikasi langsung bisa diuji.
--
--  CARA PAKAI:
--    1. Jalankan supabase/schema.sql terlebih dahulu.
--    2. Buka Supabase Dashboard > SQL Editor > jalankan file ini.
--    3. Selesai. Buka aplikasi POS-KU.
--
--  PENTING:
--    File ini TERPISAH dari kode aplikasi. Untuk memakai data UMKM asli,
--    jangan jalankan file ini, lalu tambahkan produk sendiri melalui
--    halaman "Produk". Dengan begitu data demo tidak mencemari data asli.
--
--    Cara MENGHAPUS data demo jika sudah tidak dipakai
--    (jalankan berurutan dari atas ke bawah karena ada foreign key):
--      delete from public.transaction_items;
--      delete from public.transactions;
--      delete from public.products;
--      delete from public.categories;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. KATEGORI
-- ----------------------------------------------------------------------------
insert into public.categories (name, description) values
  ('Makanan',   'Makanan siap saji dan hidangan harian'),
  ('Minuman',   'Minuman dingin dan hangat'),
  ('Sembako',   'Kebutuhan pokok rumah tangga'),
  ('Snack',     'Camilan ringan dan manisan'),
  ('Kerajinan', 'Olahan tangan khas daerah'),
  ('Batik',     'Kain dan pakaian batik'),
  ('Lainnya',   'Produk lainnya di luar kategori di atas')
on conflict (name) do update
  set description = excluded.description;

-- ----------------------------------------------------------------------------
-- 2. PRODUK
--    image_url sengaja dikosongkan (null) supaya demo tidak bergantung pada
--    gambar eksternal. Aplikasi otomatis memakai gambar placeholder.
-- ----------------------------------------------------------------------------
insert into public.products
  (name, category_id, description, price, stock, image_url, is_active)
select v.name, c.id, v.description, v.price, v.stock, null, true
from (values
  -- Makanan
  ('Nasi Goreng Spesial', 'Makanan',   'Nasi goreng dengan telur, ayam suwir, dan acar. Tersedia level 1 sampai 3.',       18000,  40),
  ('Mie Goreng Jawa',     'Makanan',   'Mie goreng Jawa khas, sambalILINGLevel 1 sampai 5.',                                  16000,  35),
  ('Roti Bakar Cokelat',  'Makanan',   'Roti tawar dibakar dengan cokelat dan keju.',                                           12000,  25),
  ('Ayam Bakar 1 Ekor',   'Makanan',   'Ayam bakar bumbu kecap, siap saji. Cocok untuk 2 sampai 3 orang.',                       35000,  12),
  ('Paket Nasi Presents', 'Makanan',   'Paket nasi lengkap untuk acara, minimal 5 porsi.',                                        75000,   5),

  -- Minuman
  ('Es Teh Manis',        'Minuman',   'Teh dingin dengan gula, es batu, dan lemon.',                                             5000, 100),
  ('Kopi Susu Gula Aren',  'Minuman',   'Kopi tubruk digiling bar, dicampur susu dan gula aren.',                                 15000,  50),
  ('Jus Alpukat',         'Minuman',   'Jus alpukat kental dengan susu dan gula.',                                                 18000,  30),
  ('Air Mineral 600ml',   'Minuman',   'Air minum dalam kemasan 600 ml.',                                                           4000, 150),
  ('Es Kelapa Muda',      'Minuman',   'Es kelapa muda segar dengan gula aren.',                                                     20000,  20),

  -- Sembako
  ('Beras Premium 5kg',   'Sembako',   'Beras Ramos pulen, kemasan 5 kg.',                                                          72000,  24),
  ('Minyak Goreng 1L',    'Sembako',   'Minyak goreng kemasan 1 liter.',                                                             19000,  30),
  ('Gula Pasir 1kg',      'Sembako',   'Gula pasir putih, kemasan 1 kg.',                                                             15500,  28),

  -- Snack
  ('Keripik Singkong',    'Snack',     'Keripik singkong asli, kemasan 250 g.',                                                      10000,  40),
  ('Kripik Pisang',       'Snack',     'Kripik pisang asli, kemasan 180 g.',                                                12000,  35),
  ('Kue Lapis Legit',     'Snack',     'Kue lapis legit yang tabur kelapa parut.',                                                    14000,  18),

  -- Kerajinan
  ('Tas Rotan Tangan',    'Kerajinan', 'Tas rotan anyaman tangan dengan warna natural.',                                            85000,   8),
  ('Tempat Gula Rotan',   'Kerajinan', 'Wadah gula rotan anyaman dengan tutup.',                                                       45000,  12),

  -- Batik
  ('Kain Batik Tulis',    'Batik',     'Kain batik tulis motif klasik, panjang 2.5 meter.',                                           185000,   6),
  ('Baju Kemeja Batik',   'Batik',     'Kemeja batik bahan katun, ukuran L.',                                                         165000,  10),

  -- Lainnya
  ('Tasbih Kayu',         'Lainnya',   'Tasbih kayu dengan 99 butir, cocok untuk hadiah.',                                             25000,  20)
) as v(name, category, description, price, stock)
join public.categories c on c.name = v.category
on conflict (name) do update
  set price       = excluded.price,
      stock       = excluded.stock,
      description = excluded.description,
      is_active   = true;

-- ----------------------------------------------------------------------------
-- 3. VERIFIKASI (opsional — boleh dihapus)
-- ----------------------------------------------------------------------------
select c.name as kategori, count(p.id) as jumlah_produk
from public.categories c
left join public.products p on p.category_id = c.id
group by c.name
order by c.name;
