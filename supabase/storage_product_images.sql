-- ============================================================================
--  POS-KU — Migration: Supabase Storage untuk Gambar Produk
--  File  : supabase/storage_product_images.sql
--
--  CARA PAKAI:
--    1. Buka Supabase Dashboard > SQL Editor
--    2. Jalankan seluruh isi file ini
--    3. Selesai. Halaman Produk bisa langsung mengunggah gambar.
--
--  APA YANG DIBUAT:
--    1. Bucket "product-images" — public, maksimal 5 MB, hanya gambar
--    2. Dua policy Storage yang HANYA berlaku untuk bucket "product-images"
--
--  TIDAK DISENTUHKAN:
--    - Tidak membuat / mengubah policy pada bucket lain.
--    - Tidak membuat policy UPDATE maupun DELETE untuk peran anon.
--    - Tidak mengubah tabel apa pun (produk, transaksi, store_profile, dll).
--    - Tidak mengubah RLS tabel store_profile.
--    - Tidak memakai service-role / secret key.
--
--  KEAMANAN:
--    - Frontend memakai "publishable key" = peran "anon".
--    - Kedua policy diberi filter `bucket_id = 'product-images'`,
--      jadi akses TIDAK meluas ke bucket lain milik project.
--    - Anon HANYA boleh membaca dan mengunggah. Tidak bisa menghapus,
--      tidak bisa menimpa file yang sudah ada (upsert dimatikan di kode).
--    - Batas ukuran & tipe ditegakkan dua lapis: oleh bucket (server-side)
--      dan oleh validasi JavaScript (client-side, pesan Bahasa Indonesia).
--
--  CATATAN: kalau nanti ditambahkan Login Admin, ganti `to anon`
--  menjadi `to authenticated` pada kedua policy.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  1. BUCKET: product-images
-- ----------------------------------------------------------------------------
--  public              : true  -> URL gambar bisa dibuka langsung oleh katalog
--  file_size_limit     : 5 MB  -> proteksi ukuran di sisi server
--  allowed_mime_types  : hanya JPG / JPEG / PNG / WEBP
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5 * 1024 * 1024,  -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
   set public             = excluded.public,
       file_size_limit    = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;


-- ----------------------------------------------------------------------------
--  2. POLICY STORAGE — hanya untuk bucket 'product-images'
-- ----------------------------------------------------------------------------

-- 2a. BACA: katalog / kasir / halaman produk menampilkan foto produk.
drop policy if exists "product_images_read" on storage.objects;
create policy "product_images_read"
  on storage.objects
  for select
  to anon
  using (bucket_id = 'product-images');

-- 2b. UPLOAD: form produk mengunggah gambar baru.
--     Path wajib diawali "produk/" supaya mudah dilacak dan tidak menabrak
--     file lain di bucket yang sama.
drop policy if exists "product_images_insert" on storage.objects;
create policy "product_images_insert"
  on storage.objects
  for insert
  to anon
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = 'produk'
  );


-- ----------------------------------------------------------------------------
--  3. VERIFIKASI (boleh dihapus setelah dibaca hasilnya)
-- ----------------------------------------------------------------------------
select id, name, public, file_size_limit, allowed_mime_types
  from storage.buckets
 where id = 'product-images';

select policyname, cmd, roles, qual
  from pg_policies
 where schemaname = 'storage'
   and tablename  = 'objects'
   and policyname like 'product_images_%'
 order by policyname;
