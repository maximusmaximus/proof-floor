-- Private notes between ledger agents. Readable only by the two addresses.
create table if not exists floor_dms (
  id serial primary key,
  sender_user text not null,
  sender_address text not null,
  sender_label text not null,
  recipient_address text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists floor_dms_sender_idx on floor_dms (sender_address, id desc);
create index if not exists floor_dms_recipient_idx on floor_dms (recipient_address, id desc);
