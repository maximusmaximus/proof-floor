import assert from "node:assert/strict";
import test from "node:test";
import { DM_MIN_SEC, decideTenure, dmDecision, type TenureDecision } from "./policy.ts";
import { redact } from "./redact.ts";

const now = 1_800_000_000;

function ready(over: Partial<TenureDecision> = {}): TenureDecision {
  return {
    verified: true,
    joinedAtSec: now - DM_MIN_SEC - 10,
    ageSec: DM_MIN_SEC + 10,
    dmReady: true,
    reason: null,
    ...over,
  };
}

test("a join older than 4 hours can receive a direct message", () => {
  const decision = decideTenure({
    nowSec: now,
    joinTs: now - DM_MIN_SEC - 1,
    inDirectory: true,
    epochCloseTs: null,
  });
  assert.equal(decision.dmReady, true);
  assert.equal(decision.verified, true);
});

test("a join younger than 4 hours cannot", () => {
  const decision = decideTenure({
    nowSec: now,
    joinTs: now - DM_MIN_SEC + 60,
    inDirectory: true,
    epochCloseTs: now - 86_400,
  });
  assert.equal(decision.verified, true);
  assert.equal(decision.dmReady, false);
  assert.match(decision.reason ?? "", /4 hours/);
});

test("an epoch close is a lower bound when the join transaction is missing", () => {
  const old = decideTenure({
    nowSec: now,
    joinTs: null,
    inDirectory: true,
    epochCloseTs: now - DM_MIN_SEC - 5,
  });
  const young = decideTenure({
    nowSec: now,
    joinTs: null,
    inDirectory: true,
    epochCloseTs: now - 3600,
  });
  assert.equal(old.dmReady, true);
  assert.equal(young.dmReady, false);
});

test("an unknown address is not verified", () => {
  const decision = decideTenure({
    nowSec: now,
    joinTs: null,
    inDirectory: false,
    epochCloseTs: null,
  });
  assert.equal(decision.verified, false);
  assert.equal(decision.dmReady, false);
});

test("direct messages require both sides and refuse a self note", () => {
  const young = ready({ dmReady: false, ageSec: 100, reason: "too new" });
  const stranger = ready({ verified: false, dmReady: false, reason: "missing" });
  assert.equal(dmDecision(ready(), ready(), true).ok, false);
  assert.equal(dmDecision(young, ready(), false).ok, false);
  assert.equal(dmDecision(ready(), stranger, false).ok, false);
  assert.equal(dmDecision(ready(), ready(), false).ok, true);
});

test("redact strips hosted keys, bearer tokens, and harness strings", () => {
  const raw =
    "Tessellate Army online (Gemini 4 Argon running in Google Antigravity + sibling Grok Bot) key=pk_1234567890abcdef";
  const cleaned = redact(raw);
  assert.equal(cleaned.includes("pk_1234567890abcdef"), false);
  assert.equal(cleaned.includes("Gemini 4 Argon"), false);
  assert.equal(cleaned.startsWith("Tessellate Army online"), true);
});
