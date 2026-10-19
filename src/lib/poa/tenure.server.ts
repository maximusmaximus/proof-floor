import { asRecord } from "./parse";
import { decideTenure, type TenureDecision } from "./policy";
import { poaGet } from "./upstream";

const ADDR = /^poa1[A-Za-z0-9]{20,120}$/;

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

type DirHit = { joinedEpoch: number | null };

let joinCache: { at: number; map: Map<string, number> } | null = null;
let joinFlight: Promise<Map<string, number>> | null = null;
let dirCache: { at: number; map: Map<string, DirHit> } | null = null;
let dirFlight: Promise<Map<string, DirHit>> | null = null;
let epochCache: { at: number; closeTs: Map<number, number> } | null = null;
let epochFlight: Promise<Map<number, number>> | null = null;

function loadJoins(): Promise<Map<string, number>> {
  if (joinCache && Date.now() - joinCache.at < 90_000) return Promise.resolve(joinCache.map);
  if (joinFlight) return joinFlight;
  joinFlight = (async () => {
    const map = new Map<string, number>();
    let before: number | null = null;
    for (let page = 0; page < 8; page += 1) {
      const path =
        before == null
          ? "/api/explorer/txs?limit=100&type=join"
          : `/api/explorer/txs?limit=100&type=join&before=${before - 1}`;
      const body = await poaGet(path, {}, 12000);
      if (!Array.isArray(body) || body.length === 0) break;
      let oldest = Infinity;
      for (const item of body) {
        const o = asRecord(item);
        if (!o) continue;
        const ts = num(o.ts);
        const addr = typeof o.from_addr === "string" ? o.from_addr : "";
        if (ts == null || !ADDR.test(addr)) continue;
        const prev = map.get(addr);
        if (prev == null || ts < prev) map.set(addr, ts);
        if (ts < oldest) oldest = ts;
      }
      if (!Number.isFinite(oldest) || (before != null && oldest >= before)) break;
      before = oldest;
      if (body.length < 100) break;
    }
    joinCache = { at: Date.now(), map };
    return map;
  })().finally(() => {
    joinFlight = null;
  });
  return joinFlight;
}

function loadDirectory(): Promise<Map<string, DirHit>> {
  if (dirCache && Date.now() - dirCache.at < 90_000) return Promise.resolve(dirCache.map);
  if (dirFlight) return dirFlight;
  dirFlight = (async () => {
    const map = new Map<string, DirHit>();
    try {
      const body = await poaGet("/api/agents", {}, 15000);
      if (Array.isArray(body)) {
        for (const item of body) {
          const o = asRecord(item);
          if (!o) continue;
          const addr = typeof o.addr === "string" ? o.addr : "";
          if (!ADDR.test(addr)) continue;
          map.set(addr, { joinedEpoch: num(o.joined_epoch) });
        }
      }
    } catch {
      return dirCache?.map ?? map;
    }
    dirCache = { at: Date.now(), map };
    return map;
  })().finally(() => {
    dirFlight = null;
  });
  return dirFlight;
}

function loadEpochCloses(): Promise<Map<number, number>> {
  if (epochCache && Date.now() - epochCache.at < 300_000) return Promise.resolve(epochCache.closeTs);
  if (epochFlight) return epochFlight;
  epochFlight = (async () => {
    const closeTs = new Map<number, number>();
    try {
      const body = await poaGet("/api/epochs", {}, 25000);
      if (Array.isArray(body)) {
        for (const item of body) {
          const o = asRecord(item);
          if (!o) continue;
          const epoch = num(o.epoch);
          const ts = num(o.ts);
          if (epoch == null || ts == null) continue;
          closeTs.set(epoch, ts);
        }
      }
    } catch {
      return epochCache?.closeTs ?? closeTs;
    }
    epochCache = { at: Date.now(), closeTs };
    return closeTs;
  })().finally(() => {
    epochFlight = null;
  });
  return epochFlight;
}

export async function tenureOf(address: string): Promise<TenureDecision> {
  const nowSec = Math.floor(Date.now() / 1000);
  if (!ADDR.test(address)) {
    return decideTenure({ nowSec, joinTs: null, inDirectory: false, epochCloseTs: null });
  }
  const [joins, dir] = await Promise.all([loadJoins().catch(() => new Map<string, number>()), loadDirectory()]);
  const joinTs = joins.get(address) ?? null;
  const hit = dir.get(address);
  let epochCloseTs: number | null = null;
  if (joinTs == null && hit?.joinedEpoch != null) {
    const closes = await loadEpochCloses().catch(() => new Map<number, number>());
    epochCloseTs = closes.get(hit.joinedEpoch) ?? null;
  }
  return decideTenure({
    nowSec,
    joinTs,
    inDirectory: Boolean(hit) || joinTs != null,
    epochCloseTs,
  });
}
