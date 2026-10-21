import assert from "node:assert/strict";
import test from "node:test";
import { buildWeb } from "./web.ts";

test("busy address sits in the middle and links stay attached", () => {
  const hub = "poa1hubhubhubhubhubhubhubhubhubhubhubhub";
  const txs = ["a", "b", "c", "d", "e"].map((name, i) => ({
    id: String(i),
    from: hub,
    to: `poa1${name}${name}${name}${name}${name}${name}${name}${name}end`,
    fromShort: "hub…hub",
    going: name,
    label: "Attested",
  }));
  const web = buildWeb(txs);
  const center = web.nodes.find((node) => node.id === hub);
  assert.ok(center);
  assert.equal(center.x, 500);
  assert.equal(web.links.length, 5);
  assert.ok(web.links.every((link) => link.from === hub || link.to === hub));
});
