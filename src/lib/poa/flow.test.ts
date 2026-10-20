import assert from "node:assert/strict";
import test from "node:test";
import { readFlowItem } from "./flow.ts";

test("an answer is going to its epoch", () => {
  const row = readFlowItem(
    {
      id: "abc123",
      type: "challenge",
      from_addr: "poa198s241NHeAb9AeW8g6EWJRJmkwBGCGapNKnfp44KPV8Q",
      to_addr: "",
      amount: "",
      epoch: 5,
      ts: 1792517193,
      final: 0,
    },
    null,
  );
  assert.equal(row?.label, "Answered");
  assert.equal(row?.going, "Epoch 5");
  assert.equal(row?.fromShort.startsWith("poa198s2"), true);
});

test("a grade is going to the assignment seat", () => {
  const row = readFlowItem(
    { id: "grade1", type: "grade-sealed", from_addr: "", ts: 10, final: 0 },
    {
      id: "grade1",
      type: "grade-sealed",
      from_addr: "poa17MU83SEGoZ2ewfVzkB8Fyoxyqi8AW5HmbK1y5iYccygG",
      ts: 10,
      body: { assignment: "cc0da1ab0e97d025393fad3f39667757d497fd2acc88981e1d03e88e3e0867bd" },
    },
  );
  assert.equal(row?.going, "Seat cc0da1ab");
  assert.equal(row?.targets[0]?.id.startsWith("cc0da1ab"), true);
});

test("an attestation is going to the transactions it signs", () => {
  const row = readFlowItem(
    { id: "att1", type: "attest-batch", ts: 10 },
    {
      id: "att1",
      type: "attest-batch",
      from_addr: "poa12mhdE2egFdxrqSoRfUPwiqR4WCEHv8EurMTsZJBHKSUS",
      ts: 10,
      body: { atts: [{ txid: "f0e70b59e5ddf01f" }, { txid: "8a6332546507538d" }] },
    },
  );
  assert.equal(row?.going, "2 transactions");
  assert.equal(row?.targets.length, 2);
});

test("a transfer is going to an address", () => {
  const row = readFlowItem(
    {
      id: "send1",
      type: "transfer",
      from_addr: "poa12mhdE2egFdxrqSoRfUPwiqR4WCEHv8EurMTsZJBHKSUS",
      to_addr: "poa17MU83SEGoZ2ewfVzkB8Fyoxyqi8AW5HmbK1y5iYccygG",
      amount: "3",
      ts: 20,
      final: 1,
    },
    null,
  );
  assert.equal(row?.label, "Sent");
  assert.equal(row?.amount, "3");
  assert.equal(row?.going.startsWith("poa17MU8"), true);
  assert.equal(row?.final, true);
});
