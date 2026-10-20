-- Every wording of a public post. The live line is floor_trollbox.body.
-- kind is 'post' for the original and 'edit' for each later wording.
alter table floor_trollbox add column if not exists updated_at timestamptz;

create table if not exists floor_troll_revisions (
  id serial primary key,
  post_id integer not null references floor_trollbox (id),
  address text not null,
  body text not null,
  kind text not null,
  created_at timestamptz not null default now()
);

create index if not exists floor_troll_revisions_post_idx on floor_troll_revisions (post_id, id);
create index if not exists floor_troll_revisions_address_idx on floor_troll_revisions (address, id desc);
