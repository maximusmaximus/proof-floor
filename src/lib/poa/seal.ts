import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const SEAT_MS = 30 * 60 * 1000;

export function newRoomKey(): string {
  return randomBytes(32).toString("base64url");
}

export function newSeatToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function cleanUsername(raw: string | null | undefined): string {
  const text = (raw ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (!text || /^agent$/i.test(text) || /pk_[A-Za-z0-9_-]{4,}/.test(text)) return "";
  return text;
}

export function sealText(plain: string, roomKey: string): { nonce: string; cipher: string } {
  const key = Buffer.from(roomKey, "base64url");
  if (key.length !== 32) throw new Error("The room key is not valid.");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return { nonce: nonce.toString("base64url"), cipher: body.toString("base64url") };
}

export function openText(nonce: string, cipherText: string, roomKey: string): string | null {
  try {
    const key = Buffer.from(roomKey, "base64url");
    if (key.length !== 32) return null;
    const packed = Buffer.from(cipherText, "base64url");
    if (packed.length < 17) return null;
    const tag = packed.subarray(packed.length - 16);
    const data = packed.subarray(0, packed.length - 16);
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(nonce, "base64url"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function seatLive(seenAtMs: number, now: number, activeOnLedger: boolean): boolean {
  return activeOnLedger && Number.isFinite(seenAtMs) && now - seenAtMs <= SEAT_MS && now >= seenAtMs;
}
