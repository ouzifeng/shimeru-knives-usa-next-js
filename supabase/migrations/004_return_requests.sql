-- Return requests table
create table return_requests (
  id bigint generated always as identity primary key,
  order_id bigint references orders(id),
  wc_order_id int,
  customer_email text not null,
  customer_name text,
  items jsonb not null,           -- [{ pid, vid?, name, qty, price }]
  reason text,                     -- optional free-text reason
  status text not null default 'pending',  -- pending | approved | received | refunded | rejected
  admin_notes text,               -- internal notes
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_return_requests_order on return_requests(order_id);
create index idx_return_requests_email on return_requests(customer_email);
create index idx_return_requests_status on return_requests(status);
