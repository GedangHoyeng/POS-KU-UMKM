-- ============================================================================
--  POS-KU — Migration: Update Nomor WhatsApp Toko
--  File  : supabase/update_whatsapp.sql
--  Tujuan : Mengubah nomor WhatsApp toko menjadi 6285723052692
--
--  CARA PAKAI:
--    1. Buka Supabase Dashboard > SQL Editor
--    2. Jalankan seluruh isi file ini
--    3. Selesai. Halaman Struk & Katalog otomatis memakai nomor baru.
--
--  CATATAN:
--    - Tidak menghapus data produk, transaksi, atau kategori.
--    - Tidak mengubah schema / RPC process_checkout.
--    - Aman dijalankan berulang kali (idempotent).
-- ============================================================================

-- 1. Update nomor WhatsApp di tabel store_profile
update public.store_profile
   set whatsapp_number = '6285723052692',
       updated_at       = now()
 where id = 1;

-- 2. Verifikasi (boleh dihapus)
select id, store_name, whatsapp_number
  from public.store_profile
 order by id;
