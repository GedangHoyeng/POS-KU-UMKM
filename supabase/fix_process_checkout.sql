-- Perbaikan cepat: process_checkout (fix jsonb iteration & raise format)
-- Jalankan di Supabase SQL Editor

create or replace function public.process_checkout(
  p_items jsonb,
  p_paid  numeric
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
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
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Keranjang masih kosong.';
  end if;

  if p_paid is null or p_paid <= 0 then
    raise exception 'Uang pelanggan belum diisi.';
  end if;

  for v_el in select value from jsonb_array_elements(p_items) loop
    if (v_el ->> 'quantity')::int is null or (v_el ->> 'quantity')::int < 1 then
      raise exception 'Jumlah produk minimal 1.';
    end if;
  end loop;

  for v_el in select value from jsonb_array_elements(p_items) loop
    select id, name, price, stock, is_active into v_product
      from public.products where id = (v_el ->> 'product_id')::bigint for update;
    if not found then
      raise exception 'Produk tidak ditemukan.';
    end if;
    if v_product.is_active = false then
      raise exception 'Produk "%" sedang tidak aktif.', v_product.name;
    end if;
    if v_product.stock < (v_el ->> 'quantity')::int then
      raise exception 'Stok produk "%" tidak mencukupi. Tersedia %, diminta %.', v_product.name, v_product.stock, (v_el ->> 'quantity')::int;
    end if;
    v_units := (v_el ->> 'quantity')::int;
    v_subtotal := v_product.price * v_units;
    v_total := v_total + v_subtotal;
    v_item_count := v_item_count + 1;
  end loop;

  if p_paid < v_total then
    raise exception 'Uang pelanggan kurang dari total transaksi.';
  end if;
  v_change := p_paid - v_total;

  select count(*) + 1 into v_seq
    from public.transactions
    where (transaction_date at time zone 'Asia/Jakarta')::date = v_today;
  while exists (
    select 1 from public.transactions
     where transaction_number = 'TRX-' || to_char(v_today,'YYYYMMDD') || '-' || lpad(v_seq::text,4,'0')
  ) loop
    v_seq := v_seq + 1;
  end loop;
  v_trx_no := 'TRX-' || to_char(v_today,'YYYYMMDD') || '-' || lpad(v_seq::text,4,'0');

  insert into public.transactions
    (transaction_number, total_amount, paid_amount, change_amount, item_count, transaction_date)
  values
    (v_trx_no, v_total, p_paid, v_change, v_item_count, now())
  returning id into v_trx_id;

  for v_el in select value from jsonb_array_elements(p_items) loop
    select id, name, price, stock into v_product
      from public.products where id = (v_el ->> 'product_id')::bigint;
    v_units := (v_el ->> 'quantity')::int;
    insert into public.transaction_items
      (transaction_id, product_id, product_name, price, quantity, subtotal)
    values
      (v_trx_id, v_product.id, v_product.name, v_product.price, v_units, v_product.price * v_units);
    update public.products
       set stock = stock - v_units
     where id = v_product.id and stock >= v_units;
    if not found then
      raise exception 'Stok produk "%" tidak mencukupi.', v_product.name;
    end if;
  end loop;

  return jsonb_build_object(
    'transaction_id', v_trx_id,
    'transaction_number', v_trx_no,
    'total_amount', v_total,
    'paid_amount', p_paid,
    'change_amount', v_change,
    'item_count', v_item_count,
    'change_needed', false
  );
end;
$$;

grant execute on function public.process_checkout(jsonb, numeric) to anon, authenticated;
