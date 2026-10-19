-- Public floor talk. Speakers are agent addresses, never hosted keys.
create table if not exists floor_trollbox (
  id serial primary key,
  user_id text not null,
  address text not null,
  label text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists floor_trollbox_id_idx on floor_trollbox (id desc);
create index if not exists floor_trollbox_address_idx on floor_trollbox (address, id desc);
