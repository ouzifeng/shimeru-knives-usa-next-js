-- Atomic stock-mirror decrement applied at purchase time (Stripe webhook).
--
-- Problem: the storefront and the checkout gate read stock from the Supabase
-- mirror, which is only refreshed from WooCommerce every 5 minutes. During a
-- promo spike that lag let two customers buy the same last unit before the
-- mirror caught up (oversold). WooCommerce stays the source of truth; this
-- function just decrements the mirror the instant an order is created so the
-- NEXT visitor sees the sale within seconds. The 5-minute sync and the
-- variation cache reconcile these values back to WooCommerce on their next
-- tick, so the write below is a freshness layer, never a second source.
--
-- `items` is a JSON array of { pid, qty, vid? } line items. A variation line
-- (vid present) decrements the child product_variations row; a simple-product
-- line decrements the products row. Parent rows of variable products are never
-- touched (they hold no real stock). stock_status is flipped to 'outofstock'
-- only when an in-stock item reaches zero, because the storefront and the
-- checkout gate key off stock_status, not quantity; onbackorder items are left
-- as-is. Quantity is clamped at 0. Untracked items (null stock_quantity, i.e.
-- WooCommerce isn't managing a count) are skipped.

-- products.stock_quantity was added out-of-band on the live DBs (written by the
-- WooCommerce sync); guard so this migration is safe on any environment.
alter table products add column if not exists stock_quantity integer;

create or replace function apply_stock_decrement(items jsonb)
returns void
language plpgsql
as $$
declare
  item jsonb;
  v_qty integer;
begin
  for item in select * from jsonb_array_elements(items)
  loop
    v_qty := coalesce((item->>'qty')::integer, 0);
    if v_qty <= 0 then
      continue;
    end if;

    if (item->>'vid') is not null then
      update product_variations
        set stock_quantity = greatest(0, coalesce(stock_quantity, 0) - v_qty),
            stock_status = case
              when stock_status = 'instock'
               and coalesce(stock_quantity, 0) - v_qty <= 0 then 'outofstock'
              else stock_status
            end
        where id = (item->>'vid')::integer
          and stock_quantity is not null;
    else
      update products
        set stock_quantity = greatest(0, coalesce(stock_quantity, 0) - v_qty),
            stock_status = case
              when stock_status = 'instock'
               and coalesce(stock_quantity, 0) - v_qty <= 0 then 'outofstock'
              else stock_status
            end
        where id = (item->>'pid')::integer
          and stock_quantity is not null;
    end if;
  end loop;
end;
$$;
