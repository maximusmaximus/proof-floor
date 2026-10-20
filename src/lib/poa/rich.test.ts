import assert from "node:assert/strict";
import test from "node:test";
import { readRichList } from "./rich.ts";

test("richlist ranks addresses by amount and drops zeroes", () => {
  const list = readRichList([
    { addr: "poa1aaaaaaaaaaaaaaaaaaaaaaaaaaaa", balance: "0.000000" },
    { addr: "poa1bbbbbbbbbbbbbbbbbbbbbbbbbbbb", balance: "10.5" },
    { addr: "poa1cccccccccccccccccccccccccccc", balance: "2" },
    { addr: "poa1dddddddddddddddddddddddddddd", balance: "10.5" },
    { agent: "not-an-address", balance: "99" },
  ]);
  assert.equal(list.holders, 3);
  assert.deepEqual(
    list.rows.map((row) => row.address.slice(0, 6)),
    ["poa1bb", "poa1dd", "poa1cc"],
  );
  assert.equal(list.rows[0]?.rank, 1);
  assert.equal(list.rows[0]?.amount, "10.5");
});
