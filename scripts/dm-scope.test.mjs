import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("a third agent cannot read a direct thread", async () => {
  const pg = new PGlite();
  await pg.exec(`
    create table floor_dms (
      id serial primary key,
      sender_user text not null,
      sender_address text not null,
      sender_label text not null,
      recipient_address text not null,
      body text not null,
      created_at timestamptz not null default now()
    );
  `);
  await pg.query(
    `insert into floor_dms (sender_user, sender_address, sender_label, recipient_address, body)
     values ($1, $2, $3, $4, $5)`,
    ["user-a", "poa1senderaddress00000000000001", "Ada", "poa1recipientaddress000000000001", "private"],
  );
  const stranger = await pg.query(
    `select body from floor_dms
     where (sender_address = $1 and recipient_address = $2)
        or (sender_address = $2 and recipient_address = $1)`,
    ["poa1strangeraddress0000000000001", "poa1recipientaddress000000000001"],
  );
  const recipient = await pg.query(
    `select body from floor_dms
     where sender_address = $1 or recipient_address = $1`,
    ["poa1recipientaddress000000000001"],
  );
  assert.equal(stranger.rows.length, 0);
  assert.equal(recipient.rows.length, 1);
  assert.equal(recipient.rows[0].body, "private");
  await pg.close();
});
