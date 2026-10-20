import { readFlowItem } from "./flow";
import type { FlowSnapshot, FlowTx } from "./types";
import { poaGet } from "./upstream";
import { scrub } from "./redact";

const LIMIT = 60;
const DETAIL_CAP = 24;

let cache: { at: number; data: FlowSnapshot } | null = null;
let flight: Promise<FlowSnapshot> | null = null;

async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, () => worker()));
  return out;
}

async function walk(): Promise<FlowSnapshot> {
  const body = await poaGet(`/api/explorer/txs?limit=${LIMIT}`, {}, 12000);
  const list = Array.isArray(body) ? body : [];
  const head = list.slice(0, DETAIL_CAP);
  const details = await pool(head, 6, async (item) => {
    const id = item && typeof item === "object" && "id" in item && typeof item.id === "string" ? item.id : "";
    if (!/^[a-f0-9]{16,128}$/i.test(id)) return null;
    try {
      return await poaGet(`/api/explorer/tx/${id}`, {}, 8000);
    } catch {
      return null;
    }
  });
  const txs: FlowTx[] = [];
  list.forEach((item, index) => {
    const row = readFlowItem(item, index < details.length ? details[index] : null);
    if (row) txs.push(row);
  });
  return scrub({ ok: true, error: null, txs });
}

export function loadFlow(): Promise<FlowSnapshot> {
  if (cache && Date.now() - cache.at < 20000) return Promise.resolve(cache.data);
  if (flight) return flight;
  flight = walk()
    .then((data) => {
      if (data.ok) cache = { at: Date.now(), data };
      return data;
    })
    .catch((e: unknown) => {
      const error = e instanceof Error ? e.message : "Transactions did not load.";
      return cache?.data ?? { ok: false, error, txs: [] };
    })
    .finally(() => {
      flight = null;
    });
  return flight;
}
