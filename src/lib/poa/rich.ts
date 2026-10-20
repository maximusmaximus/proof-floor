import { shortAddr } from "./format.ts";
import { asRecord } from "./parse.ts";
import type { RichList, RichRow } from "./types";

const ADDR = /^poa1[A-Za-z0-9]{20,120}$/;

export function readRichList(body: unknown, limit = 40): RichList {
  const list = Array.isArray(body) ? body : [];
  const scored: { address: string; amount: string; n: number }[] = [];
  for (const item of list) {
    const o = asRecord(item);
    if (!o) continue;
    const address = typeof o.addr === "string" ? o.addr : typeof o.agent === "string" ? o.agent : "";
    if (!ADDR.test(address)) continue;
    const amount = typeof o.balance === "string" ? o.balance : o.balance != null ? String(o.balance) : "";
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) continue;
    scored.push({ address, amount, n });
  }
  scored.sort((a, b) => (b.n === a.n ? (a.address < b.address ? -1 : 1) : b.n - a.n));
  const rows: RichRow[] = scored.slice(0, limit).map((row, index) => ({
    rank: index + 1,
    address: row.address,
    short: shortAddr(row.address),
    amount: row.amount,
  }));
  return { ok: true, error: null, holders: scored.length, rows };
}
