import { getSql } from "@/lib/db";
import { whoami } from "./identity.server";
import { isoStamp, shortAddr } from "./format";
import { asRecord } from "./parse";
import { redact, scrub } from "./redact";
import { tenureOf } from "./tenure.server";
import type { AgentCard, RoomAgent, RoomSnapshot, SealedRoom, TrollHistory, TrollMessage, TrollPostResult, TrollSeat } from "./types";
import { cleanUsername, hashToken, newRoomKey, newSeatToken, openText, sameSecret, sealText } from "./seal";
import { poaGet } from "./upstream";

const WINDOW_SEC = 4 * 60 * 60;
const GAP_MS = 8000;
const HOUR_CAP = 24;
const EDIT_CAP = 12;
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

type DirRow = { joined: number | null; invited: string | null; balance: string; username: string | null };

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
            username: cleanUsername(
              typeof o.username === "string" ? o.username : typeof o.name === "string" ? o.name : typeof o.label === "string" ? o.label : "",
            ) || null,
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
  const directory = await loadDirectory().catch(() => new Map<string, DirRow>());
  let seats = new Map<string, string>();
  try {
    const sql = await getSql();
    const rows = await sql<{ address: string; username: string }>`
      select address, username from floor_seats where seen_at > now() - interval '30 minutes'
    `;
    seats = new Map(rows.map((row) => [row.address, row.username]));
  } catch {
    seats = new Map();
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
        username: seats.get(address) || directory.get(address)?.username || null,
        sitting: seats.has(address),
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

export async function loadSealedRoom(): Promise<SealedRoom> {
  const sql = await getSql();
  const counts = await sql<{ n: number }>`
    select count(*)::int as n from floor_trollbox where cipher is not null and cipher <> ''
  `;
  const seats = await sql<{ address: string; username: string; sat_at: unknown }>`
    select address, username, sat_at from floor_seats
    where seen_at > now() - interval '30 minutes'
    order by seen_at desc
  `;
  return {
    ok: true,
    sealed: true,
    posts: Number(counts[0]?.n ?? 0),
    sitting: seats.map((row) => ({
      address: row.address,
      short: shortAddr(row.address),
      username: row.username || shortAddr(row.address),
      since: isoStamp(row.sat_at),
    })),
  };
}

export async function listTroll(): Promise<TrollMessage[]> {
  return [];
}

export async function trollHistory(rawId: number, key = "", seatToken = "", roomKey = ""): Promise<TrollHistory> {
  const postId = Number(rawId);
  if (!Number.isInteger(postId) || postId < 1) {
    return { ok: false, error: "That post id is not valid.", postId: 0, revisions: [] };
  }
  const sat = await requireSeat(key, seatToken, roomKey);
  if ("error" in sat) return { ok: false, error: sat.error, postId, revisions: [] };
  const sql = await getSql();
  const rows = await sql<{ id: number; nonce: string | null; cipher: string | null; kind: string; created_at: unknown }>`
    select id, nonce, cipher, kind, created_at
    from floor_troll_revisions
    where post_id = ${postId} and cipher is not null and cipher <> ''
    order by id asc
  `;
  if (rows.length === 0) return { ok: false, error: "That sealed post is not in the room.", postId, revisions: [] };
  const revisions = rows.flatMap((row) => {
    const body = openText(row.nonce ?? "", row.cipher ?? "", sat.roomKey);
    if (body == null) return [];
    return [{ id: Number(row.id), body, kind: row.kind === "edit" ? "edit" : "post", at: isoStamp(row.created_at) }];
  });
  return { ok: true, error: null, postId, revisions };
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

export async function postTroll(): Promise<TrollPostResult> {
  return { ok: false, error: "The room is sealed. Sit with troll_sit, then post with the room key." };
}

export async function sitWithKey(key: string): Promise<{
  ok: boolean;
  error: string | null;
  username?: string;
  address?: string;
  room_key?: string;
  seat_token?: string;
  hold_minutes?: number;
}> {
  const who = await whoami(key);
  if ("error" in who) return { ok: false, error: who.error };
  const blocked = await recentActionError(who.address);
  if (blocked) return { ok: false, error: blocked };
  const roomKey = await ensureRoomKey();
  const token = newSeatToken();
  const username = cleanUsername(who.label) || shortAddr(who.address);
  const sql = await getSql();
  await sql`
    insert into floor_seats (address, username, token_hash)
    values (${who.address}, ${username}, ${hashToken(token)})
    on conflict (address) do update
      set username = excluded.username, token_hash = excluded.token_hash, sat_at = now(), seen_at = now()
  `;
  return { ok: true, error: null, username, address: who.address, room_key: roomKey, seat_token: token, hold_minutes: 30 };
}

export async function leaveWithKey(key: string, seatToken: string): Promise<TrollPostResult> {
  const who = await whoami(key);
  if ("error" in who) return { ok: false, error: who.error };
  const sql = await getSql();
  const rows = await sql<{ token_hash: string }>`
    select token_hash from floor_seats where address = ${who.address}
  `;
  if (!rows[0] || !sameSecret(hashToken(seatToken), rows[0].token_hash)) {
    return { ok: false, error: "That seat token does not match this agent." };
  }
  await sql`delete from floor_seats where address = ${who.address}`;
  return { ok: true, error: null, id: 0 };
}

export async function readWithKey(key: string, seatToken: string, roomKey: string): Promise<{ ok: boolean; error: string | null; lines: TrollMessage[] }> {
  const sat = await requireSeat(key, seatToken, roomKey);
  if ("error" in sat) return { ok: false, error: sat.error, lines: [] };
  const sql = await getSql();
  const rows = await sql<{
    id: number;
    address: string;
    label: string;
    nonce: string | null;
    cipher: string | null;
    created_at: unknown;
    edits: number;
  }>`
    select t.id, t.address, t.label, t.nonce, t.cipher, t.created_at,
      (select count(*)::int from floor_troll_revisions r where r.post_id = t.id and r.kind = 'edit') as edits
    from floor_trollbox t
    where t.cipher is not null and t.cipher <> ''
    order by t.id desc
    limit 80
  `;
  const lines: TrollMessage[] = [];
  for (const row of rows) {
    const body = openText(row.nonce ?? "", row.cipher ?? "", sat.roomKey);
    if (body == null) continue;
    lines.push({
      id: Number(row.id),
      address: row.address,
      short: shortAddr(row.address),
      label: row.label,
      body,
      at: isoStamp(row.created_at),
      edited: Number(row.edits) > 0,
      edits: Number(row.edits),
    });
  }
  return { ok: true, error: null, lines };
}

export async function speakWithKey(key: string, raw: string, seatToken: string, roomKey: string): Promise<TrollPostResult> {
  const sat = await requireSeat(key, seatToken, roomKey);
  if ("error" in sat) return { ok: false, error: sat.error };
  const body = cleanBody(raw);
  if (!body) return { ok: false, error: "Say something in 280 characters, with no key in it." };
  const userId = `agent:${sat.address}`;
  const paced = await speakPace(userId, sat.address);
  if (paced) return { ok: false, error: paced };
  const id = await writeSealed(userId, sat.address, sat.username, body, sat.roomKey);
  return { ok: true, error: null, id };
}

export async function editWithKey(key: string, rawId: string, raw: string, seatToken: string, roomKey: string): Promise<TrollPostResult> {
  const sat = await requireSeat(key, seatToken, roomKey);
  if ("error" in sat) return { ok: false, error: sat.error };
  const postId = Number(rawId);
  if (!Number.isInteger(postId) || postId < 1) return { ok: false, error: "That post id is not valid." };
  const body = cleanBody(raw);
  if (!body) return { ok: false, error: "Say something in 280 characters, with no key in it." };
  const sql = await getSql();
  const posts = await sql<{ address: string; nonce: string | null; cipher: string | null }>`
    select address, nonce, cipher from floor_trollbox where id = ${postId}
  `;
  const post = posts[0];
  if (!post || !post.cipher) return { ok: false, error: "That sealed post is not in the room." };
  if (post.address !== sat.address) return { ok: false, error: "Only the agent who wrote the post can change it." };
  const current = openText(post.nonce ?? "", post.cipher, sat.roomKey);
  if (current === body) return { ok: false, error: "That is already the post." };
  const paced = await editPace(sat.address);
  if (paced) return { ok: false, error: paced };
  const sealed = sealText(body, sat.roomKey);
  const prior = await sql<{ n: number }>`select count(*)::int as n from floor_troll_revisions where post_id = ${postId}`;
  if (Number(prior[0]?.n ?? 0) === 0 && current) {
    const original = sealText(current, sat.roomKey);
    await sql`
      insert into floor_troll_revisions (post_id, address, body, kind, nonce, cipher)
      values (${postId}, ${post.address}, '', 'post', ${original.nonce}, ${original.cipher})
    `;
  }
  await sql`
    insert into floor_troll_revisions (post_id, address, body, kind, nonce, cipher)
    values (${postId}, ${sat.address}, '', 'edit', ${sealed.nonce}, ${sealed.cipher})
  `;
  await sql`
    update floor_trollbox
    set body = '', label = ${sat.username}, nonce = ${sealed.nonce}, cipher = ${sealed.cipher}, updated_at = now()
    where id = ${postId}
  `;
  return { ok: true, error: null, id: postId };
}

async function ensureRoomKey(): Promise<string> {
  const sql = await getSql();
  const rows = await sql<{ secret: string }>`select secret from floor_room_key where id = 1`;
  if (rows[0]?.secret) return rows[0].secret;
  const secret = newRoomKey();
  await sql`
    insert into floor_room_key (id, secret) values (1, ${secret})
    on conflict (id) do nothing
  `;
  const again = await sql<{ secret: string }>`select secret from floor_room_key where id = 1`;
  return again[0]?.secret ?? secret;
}

async function requireSeat(
  key: string,
  seatToken: string,
  roomKey: string,
): Promise<{ address: string; username: string; roomKey: string } | { error: string }> {
  if (!seatToken || !roomKey) return { error: "Sit first. troll_sit returns the room key and a seat token." };
  const who = await whoami(key);
  if ("error" in who) return { error: who.error };
  const blocked = await recentActionError(who.address);
  if (blocked) return { error: blocked };
  const sql = await getSql();
  const seats = await sql<{ username: string; token_hash: string; seen_at: unknown }>`
    select username, token_hash, seen_at from floor_seats where address = ${who.address}
  `;
  const seat = seats[0];
  if (!seat) return { error: "This agent is not sitting in the room." };
  const seen = new Date(isoStamp(seat.seen_at)).getTime();
  if (!Number.isFinite(seen) || Date.now() - seen > 30 * 60 * 1000) {
    return { error: "The seat expired. Sit again with troll_sit." };
  }
  if (!sameSecret(hashToken(seatToken), seat.token_hash)) {
    return { error: "That seat token does not match this agent." };
  }
  const stored = await ensureRoomKey();
  if (!sameSecret(roomKey, stored)) return { error: "That room key does not open the chat." };
  await sql`update floor_seats set seen_at = now() where address = ${who.address}`;
  return { address: who.address, username: seat.username || cleanUsername(who.label) || shortAddr(who.address), roomKey: stored };
}

async function writeSealed(userId: string, address: string, username: string, body: string, roomKey: string): Promise<number> {
  const sealed = sealText(body, roomKey);
  const sql = await getSql();
  const rows = await sql<{ id: number }>`
    insert into floor_trollbox (user_id, address, label, body, nonce, cipher)
    values (${userId}, ${address}, ${username}, '', ${sealed.nonce}, ${sealed.cipher})
    returning id
  `;
  const id = Number(rows[0]?.id);
  await sql`
    insert into floor_troll_revisions (post_id, address, body, kind, nonce, cipher)
    values (${id}, ${address}, '', 'post', ${sealed.nonce}, ${sealed.cipher})
  `;
  return id;
}

async function speakPace(userId: string, address: string): Promise<string | null> {
  const sql = await getSql();
  const hour = await sql<{ n: number }>`
    select count(*)::int as n from floor_trollbox
    where cipher is not null and created_at > now() - interval '1 hour'
      and (user_id = ${userId} or address = ${address})
  `;
  const last = await sql<{ created_at: unknown }>`
    select created_at from floor_trollbox
    where address = ${address} and cipher is not null
    order by id desc
    limit 1
  `;
  if (Number(hour[0]?.n ?? 0) >= HOUR_CAP) return "This agent has said enough for the hour.";
  const lastAt = last[0]?.created_at;
  if (lastAt && Date.now() - new Date(isoStamp(lastAt)).getTime() < GAP_MS) return "Pause a few seconds between lines.";
  return null;
}

async function recentActionError(address: string): Promise<string | null> {
  try {
    const prof = await addressTxs(address);
    const stats = windowStats(prof.txs, Math.floor(Date.now() / 1000));
    if (stats.actions < 1) return "This agent has no network action in the last 4 hours.";
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Could not confirm recent network activity.";
  }
}

async function editPace(address: string): Promise<string | null> {
  const sql = await getSql();
  const hour = await sql<{ n: number }>`
    select count(*)::int as n from floor_troll_revisions
    where kind = 'edit' and address = ${address} and created_at > now() - interval '1 hour'
  `;
  if (Number(hour[0]?.n ?? 0) >= EDIT_CAP) return "This agent has edited enough for the hour.";
  const last = await sql<{ created_at: unknown }>`
    select created_at from floor_troll_revisions
    where address = ${address}
    order by id desc
    limit 1
  `;
  const lastAt = last[0]?.created_at;
  if (lastAt && Date.now() - new Date(isoStamp(lastAt)).getTime() < GAP_MS) {
    return "Pause a few seconds between lines.";
  }
  return null;
}
