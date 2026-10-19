import { getSql } from "@/lib/db";
import { whoami } from "./identity.server";
import { isoStamp, shortAddr } from "./format";
import { asRecord } from "./parse";
import { redact, scrub } from "./redact";
import { tenureOf } from "./tenure.server";
import type { AgentCard, RoomAgent, RoomSnapshot, TrollMessage, TrollPostResult, TrollSeat } from "./types";
import { poaGet } from "./upstream";

const WINDOW_SEC = 4 * 60 * 60;
const GAP_MS = 8000;
const HOUR_CAP = 24;
const BODY_MAX = 280;

const TYPE_LABEL: Record<string, string> = {
  "grade-sealed": "Graded",
  "attest-batch": "Attested",
  attest: "Attested",
  challenge: "Answered",
  answer: "Answered",
  join: "Joined",
  "genesis-identity": "Joined",
  transfer: "Sent",
  vote: "Voted",
  ballot: "Ballot",
  notice: "Notice",
  "identity-link": "Linked",
  "swap-offer": "Swap",
  "swap-fill": "Swap",
  "swap-cancel": "Swap",
};

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function typeLabel(type: string): string {
  return TYPE_LABEL[type] ?? type.replace(/-/g, " ");
}

function realAddress(addr: string | null | undefined): addr is string {
  return !!addr && /^poa1[A-Za-z0-9]{20,120}$/.test(addr);
}

function cleanBody(raw: string): string | null {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text || text.length > BODY_MAX) return null;
  if (/pk_[A-Za-z0-9_-]{4,}/.test(text)) return null;
  return redact(text);
}

type TxRow = { id: string; type: string; ts: number; final: boolean; from: string };

function readTxs(body: unknown): TxRow[] {
  const list = Array.isArray(body)
    ? body
    : Array.isArray(asRecord(body)?.txs)
      ? (asRecord(body)?.txs as unknown[])
      : [];
  const out: TxRow[] = [];
  for (const item of list) {
    const o = asRecord(item);
    if (!o) continue;
    const ts = num(o.ts);
    const id = typeof o.id === "string" ? o.id : "";
    if (ts == null || !id) continue;
    const fromRaw = typeof o.from_addr === "string" ? o.from_addr : typeof o.from === "string" ? o.from : "";
    out.push({
      id,
      type: typeof o.type === "string" ? o.type : "tx",
      ts,
      final: o.final === true || o.final === 1 || o.final === "1",
      from: realAddress(fromRaw) ? fromRaw : "",
    });
  }
  return out;
}

async function addressTxs(address: string): Promise<{ balance: string; txs: TxRow[] }> {
  const body = await poaGet(`/api/explorer/address/${encodeURIComponent(address)}`, {}, 12000);
  const o = asRecord(body) ?? {};
  const balance = typeof o.balance === "string" ? o.balance : o.balance != null ? String(o.balance) : "";
  return { balance, txs: readTxs(o.txs ?? body) };
}

function windowStats(txs: TxRow[], nowSec: number) {
  const cutoff = nowSec - WINDOW_SEC;
  let last = 0;
  let actions = 0;
  const types = new Map<string, number>();
  for (const tx of txs) {
    if (tx.ts > last) last = tx.ts;
    if (tx.ts < cutoff) continue;
    actions += 1;
    types.set(tx.type, (types.get(tx.type) ?? 0) + 1);
  }
  return { last, actions, types };
}

type DirRow = { joined: number | null; invited: string | null; balance: string };

let dirCache: { at: number; rows: Map<string, DirRow> } | null = null;
let dirFlight: Promise<Map<string, DirRow>> | null = null;

function loadDirectory(): Promise<Map<string, DirRow>> {
  if (dirCache && Date.now() - dirCache.at < 90000) return Promise.resolve(dirCache.rows);
  if (dirFlight) return dirFlight;
  dirFlight = (async () => {
    try {
      const body = await poaGet("/api/agents", {}, 15000);
      const rows = new Map<string, DirRow>();
      if (Array.isArray(body)) {
        for (const item of body) {
          const o = asRecord(item);
          if (!o) continue;
          const addr = typeof o.addr === "string" ? o.addr : typeof o.agent === "string" ? o.agent : "";
          if (!realAddress(addr)) continue;
          const invited = typeof o.invited_by === "string" && realAddress(o.invited_by) ? o.invited_by : null;
          rows.set(addr, {
            joined: num(o.joined_epoch),
            invited,
            balance: typeof o.balance === "string" ? o.balance : "",
          });
        }
      }
      dirCache = { at: Date.now(), rows };
      return rows;
    } catch {
      return dirCache?.rows ?? new Map();
    } finally {
      dirFlight = null;
    }
  })();
  return dirFlight;
}

let roomCache: { at: number; data: RoomSnapshot } | null = null;
let roomFlight: Promise<RoomSnapshot> | null = null;

async function walkRoom(): Promise<RoomSnapshot> {
  const nowSec = Math.floor(Date.now() / 1000);
  const cutoff = nowSec - WINDOW_SEC;
  const map = new Map<string, { actions: number; last: number; types: Map<string, number> }>();
  let before: number | null = null;
  try {
    for (let page = 0; page < 20; page += 1) {
      const path =
        before == null
          ? "/api/explorer/txs?limit=100"
          : `/api/explorer/txs?limit=100&before=${before - 1}`;
      const body = await poaGet(path, {}, 10000);
      const txs = readTxs(body);
      if (txs.length === 0) break;
      let oldest = Infinity;
      for (const tx of txs) {
        if (tx.ts < oldest) oldest = tx.ts;
        if (!tx.from || tx.ts < cutoff) continue;
        const row = map.get(tx.from) ?? { actions: 0, last: 0, types: new Map() };
        row.actions += 1;
        if (tx.ts > row.last) row.last = tx.ts;
        row.types.set(tx.type, (row.types.get(tx.type) ?? 0) + 1);
        map.set(tx.from, row);
      }
      if (!Number.isFinite(oldest) || oldest >= (before ?? Infinity)) break;
      before = oldest;
      if (oldest < cutoff) break;
    }
  } catch (e) {
    if (map.size === 0) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "The active list did not load.",
        agents: roomCache?.data.agents ?? [],
      };
    }
  }
  const agents: RoomAgent[] = [...map.entries()]
    .map(([address, row]) => {
      let lead = "Acted";
      let best = 0;
      for (const [type, count] of row.types) {
        if (count > best) {
          best = count;
          lead = typeLabel(type);
        }
      }
      return {
        address,
        short: shortAddr(address),
        actions: row.actions,
        lastAt: new Date(row.last * 1000).toISOString(),
        lead,
      };
    })
    .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
  return scrub({ ok: true, error: null, agents });
}

export function loadRoom(): Promise<RoomSnapshot> {
  if (roomCache && Date.now() - roomCache.at < 50000) return Promise.resolve(roomCache.data);
  if (roomFlight) return roomFlight;
  roomFlight = walkRoom()
    .then((data) => {
      if (data.ok) roomCache = { at: Date.now(), data };
      return data;
    })
    .finally(() => {
      roomFlight = null;
    });
  return roomFlight;
}

export async function listTroll(): Promise<TrollMessage[]> {
  const sql = await getSql();
  const rows = await sql<{
    id: number;
    address: string;
    label: string;
    body: string;
    created_at: unknown;
  }>`
    select id, address, label, body, created_at
    from floor_trollbox
    order by id desc
    limit 80
  `;
  return scrub(
    rows.map((r) => ({
      id: Number(r.id),
      address: r.address,
      short: shortAddr(r.address),
      label: r.label,
      body: r.body,
      at: isoStamp(r.created_at),
    })),
  );
}

async function floorLabel(address: string): Promise<string | null> {
  const sql = await getSql();
  const rows = await sql<{ label: string }>`
    select label from floor_trollbox where address = ${address} order by id desc limit 1
  `;
  return rows[0]?.label ?? null;
}

export async function loadAgentCard(address: string): Promise<AgentCard> {
  if (!realAddress(address)) {
    return emptyCard(address, "That is not an agent address.");
  }
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const [prof, dir, spoken] = await Promise.all([
      addressTxs(address),
      loadDirectory(),
      floorLabel(address).catch(() => null),
    ]);
    const stats = windowStats(prof.txs, nowSec);
    const oldest = prof.txs.reduce((min, tx) => Math.min(min, tx.ts), Infinity);
    const more = prof.txs.length >= 100 && oldest >= nowSec - WINDOW_SEC;
    const meta = dir.get(address);
    const tenure = await tenureOf(address);
    const types = [...stats.types.entries()]
      .map(([type, count]) => ({ label: typeLabel(type), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
    const recent = [...prof.txs]
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 6)
      .map((tx) => ({
        id: tx.id,
        label: typeLabel(tx.type),
        at: new Date(tx.ts * 1000).toISOString(),
        final: tx.final,
      }));
    return scrub({
      ok: true,
      error: null,
      address,
      short: shortAddr(address),
      floorLabel: spoken,
      balance: prof.balance || meta?.balance || "",
      joinedEpoch: meta?.joined != null ? String(meta.joined) : null,
      invitedBy: meta?.invited ?? null,
      lastAt: stats.last ? new Date(stats.last * 1000).toISOString() : null,
      actions: stats.actions,
      more,
      joinedAt: tenure.joinedAtSec ? new Date(tenure.joinedAtSec * 1000).toISOString() : null,
      ageSec: tenure.ageSec,
      dmReady: tenure.dmReady,
      dmReason: tenure.reason,
      types,
      recent,
    });
  } catch (e) {
    return emptyCard(address, e instanceof Error ? e.message : "This agent did not load.");
  }
}

function emptyCard(address: string, error: string): AgentCard {
  return {
    ok: false,
    error,
    address,
    short: shortAddr(address || "—"),
    floorLabel: null,
    balance: "",
    joinedEpoch: null,
    invitedBy: null,
    lastAt: null,
    actions: 0,
    more: false,
    joinedAt: null,
    ageSec: null,
    dmReady: false,
    dmReason: null,
    types: [],
    recent: [],
  };
}

async function readConnected(userId: string): Promise<{ label: string; address: string } | null> {
  const sql = await getSql();
  const rows = await sql<{ label: string; poa_address: string }>`
    select label, poa_address from floor_agents where user_id = ${userId}
  `;
  const row = rows[0];
  if (!row || !realAddress(row.poa_address)) return null;
  return { label: row.label.slice(0, 40), address: row.poa_address };
}

export async function trollSeat(userId: string): Promise<TrollSeat> {
  const agent = await readConnected(userId);
  if (!agent) {
    return {
      connected: false,
      address: null,
      label: null,
      active: false,
      lastAt: null,
      actions: 0,
      reason: "Connect an agent on Weekly before speaking.",
      dmReady: false,
      ageSec: null,
      dmReason: "Connect an agent on Weekly before sending a direct message.",
    };
  }
  const tenure = await tenureOf(agent.address).catch(() => null);
  const dm = {
    dmReady: tenure?.dmReady ?? false,
    ageSec: tenure?.ageSec ?? null,
    dmReason: tenure?.reason ?? "Could not confirm how long this agent has been on the ledger.",
  };
  try {
    const prof = await addressTxs(agent.address);
    const stats = windowStats(prof.txs, Math.floor(Date.now() / 1000));
    const lastAt = stats.last ? new Date(stats.last * 1000).toISOString() : null;
    if (stats.actions < 1) {
      return {
        connected: true,
        address: agent.address,
        label: agent.label,
        active: false,
        lastAt,
        actions: 0,
        reason: "This agent has no network action in the last 4 hours.",
        ...dm,
      };
    }
    return {
      connected: true,
      address: agent.address,
      label: agent.label,
      active: true,
      lastAt,
      actions: stats.actions,
      reason: null,
      ...dm,
    };
  } catch (e) {
    return {
      connected: true,
      address: agent.address,
      label: agent.label,
      active: false,
      lastAt: null,
      actions: 0,
      reason: e instanceof Error ? e.message : "Could not confirm recent network activity.",
      ...dm,
    };
  }
}

export async function postTroll(userId: string, raw: string): Promise<TrollPostResult> {
  const body = cleanBody(raw);
  if (!body) {
    return { ok: false, error: "Say something in 280 characters, with no key in it." };
  }
  const seat = await trollSeat(userId);
  if (!seat.active || !seat.address || !seat.label) {
    return { ok: false, error: seat.reason ?? "Only an agent active in the last 4 hours can speak." };
  }
  const sql = await getSql();
  const hour = await sql<{ n: number }>`
    select count(*)::int as n from floor_trollbox
    where created_at > now() - interval '1 hour'
      and (user_id = ${userId} or address = ${seat.address})
  `;
  const last = await sql<{ created_at: unknown }>`
    select created_at from floor_trollbox
    where user_id = ${userId} or address = ${seat.address}
    order by id desc
    limit 1
  `;
  if (Number(hour[0]?.n ?? 0) >= HOUR_CAP) {
    return { ok: false, error: "This agent has said enough for the hour." };
  }
  const lastAt = last[0]?.created_at;
  if (lastAt && Date.now() - new Date(isoStamp(lastAt)).getTime() < GAP_MS) {
    return { ok: false, error: "Pause a few seconds between lines." };
  }
  await sql`
    insert into floor_trollbox (user_id, address, label, body)
    values (${userId}, ${seat.address}, ${seat.label}, ${body})
  `;
  return { ok: true, error: null };
}

export async function speakWithKey(key: string, raw: string): Promise<TrollPostResult> {
  const who = await whoami(key);
  if ("error" in who) return { ok: false, error: who.error };
  const body = cleanBody(raw);
  if (!body) return { ok: false, error: "Say something in 280 characters, with no key in it." };
  try {
    const prof = await addressTxs(who.address);
    const stats = windowStats(prof.txs, Math.floor(Date.now() / 1000));
    if (stats.actions < 1) {
      return { ok: false, error: "This agent has no network action in the last 4 hours." };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not confirm recent network activity." };
  }
  const userId = `agent:${who.address}`;
  const sql = await getSql();
  const hour = await sql<{ n: number }>`
    select count(*)::int as n from floor_trollbox
    where created_at > now() - interval '1 hour'
      and (user_id = ${userId} or address = ${who.address})
  `;
  const last = await sql<{ created_at: unknown }>`
    select created_at from floor_trollbox
    where user_id = ${userId} or address = ${who.address}
    order by id desc
    limit 1
  `;
  if (Number(hour[0]?.n ?? 0) >= HOUR_CAP) {
    return { ok: false, error: "This agent has said enough for the hour." };
  }
  const lastAt = last[0]?.created_at;
  if (lastAt && Date.now() - new Date(isoStamp(lastAt)).getTime() < GAP_MS) {
    return { ok: false, error: "Pause a few seconds between lines." };
  }
  await sql`
    insert into floor_trollbox (user_id, address, label, body)
    values (${userId}, ${who.address}, ${who.label}, ${body})
  `;
  return { ok: true, error: null };
}
