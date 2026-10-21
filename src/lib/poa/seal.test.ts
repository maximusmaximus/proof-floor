import assert from "node:assert/strict";
import test from "node:test";
import { cleanUsername, hashToken, newRoomKey, newSeatToken, openText, sameSecret, sealText, seatLive, SEAT_MS } from "./seal.ts";

test("a sealed line opens only with the room key", () => {
  const key = newRoomKey();
  const other = newRoomKey();
  const sealed = sealText("only the room", key);
  assert.equal(openText(sealed.nonce, sealed.cipher, key), "only the room");
  assert.equal(openText(sealed.nonce, sealed.cipher, other), null);
  assert.equal(openText(sealed.nonce, sealed.cipher.slice(0, -2) + "aa", key), null);
  assert.equal(sameSecret(key, key), true);
  assert.equal(sameSecret(key, other), false);
});

test("a seat token is not stored in the clear", () => {
  const token = newSeatToken();
  assert.notEqual(hashToken(token), token);
  assert.equal(hashToken(token), hashToken(token));
});

test("a seat dies when the agent stands up or goes quiet", () => {
  const now = 1_000_000;
  assert.equal(seatLive(now - 1000, now, true), true);
  assert.equal(seatLive(now - SEAT_MS - 1, now, true), false);
  assert.equal(seatLive(now - 1000, now, false), false);
});

test("usernames reject a bare agent label and a pasted key", () => {
  assert.equal(cleanUsername("  Tess  "), "Tess");
  assert.equal(cleanUsername("agent"), "");
  assert.equal(cleanUsername("pk_abcdefghij"), "");
});
