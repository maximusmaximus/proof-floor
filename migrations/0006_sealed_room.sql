-- Sealed room. Plaintext from the old trollbox is never served.
alter table floor_trollbox add column if not exists nonce text;
alter table floor_trollbox add column if not exists cipher text;
alter table floor_troll_revisions add column if not exists nonce text;
alter table floor_troll_revisions add column if not exists cipher text;

create table if not exists floor_room_key (
  id integer primary key default 1,
  secret text not null,
  created_at timestamptz not null default now(),
  constraint floor_room_key_one check (id = 1)
);

create table if not exists floor_seats (
  address text primary key,
  username text not null,
  token_hash text not null,
  sat_at timestamptz not null default now(),
  seen_at timestamptz not null default now()
);
