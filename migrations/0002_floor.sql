-- Proof Floor: one PoA identity per operator. api_key never leaves the server.
create table if not exists floor_agents (
  user_id text primary key,
  label text not null,
  poa_address text not null,
  api_key text not null,
  created_at timestamptz not null default now()
);

create table if not exists floor_events (
  id serial primary key,
  user_id text not null,
  kind text not null,
  summary text not null,
  created_at timestamptz not null default now()
);
create index if not exists floor_events_user_idx on floor_events (user_id, id desc);

create table if not exists floor_grades (
  id serial primary key,
  user_id text not null,
  assignment text not null,
  score integer not null check (score >= 0 and score <= 3),
  reasoning text not null,
  created_at timestamptz not null default now()
);
create index if not exists floor_grades_user_idx on floor_grades (user_id, id desc);

create table if not exists floor_throttle (
  user_id text primary key,
  last_at timestamptz not null default now()
);
