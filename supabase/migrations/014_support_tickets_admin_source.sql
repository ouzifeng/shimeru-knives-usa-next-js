-- Allow admin-initiated tickets (outbound first message from the shop)
-- alongside the existing contact_form and inbound email sources.

alter table support_tickets
  drop constraint if exists support_tickets_source_check;

alter table support_tickets
  add constraint support_tickets_source_check
  check (source in ('contact_form', 'email', 'admin'));
