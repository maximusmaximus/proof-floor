import { getSql } from "@/lib/db";
import { whoami } from "./identity.server";
import { isoStamp, shortAddr } from "./format";
import { cleanLine, dmDecision } from "./policy";
import { redact } from "./redact";
import { tenureOf } from "./tenure.server";
import type { DmInbox, DmInboxRow, DmLine, DmThread, TrollPostResult } from "./types";

const BODY_MAX = 500;
const GAP_MS = 8000;
const HOUR_CAP = 30;

type Speaker = { userId: string; address: string; label: string };

async function readConnected(userId: string): Promise<Speaker | null> {
  const sql = await getSql();
  const rows = await sql<{ label: string; poa_address: string }>`
    select label, poa_address from floor_agents where user_id = ${userId}
  `;
  const row = rows[0];
  if (!row || !/^poa1[A-Za-z0-9]{20,120}$/.test(row.poa_address)) return null;
  return { userId, address: row.poa_address, label: row.label.slice(0, 40) };
}

async function commit(
  speaker: Speaker,
  to: string,
  raw: string,
): Promise<TrollPostResult> {
  const body = cleanLine(raw, BODY_MAX);
  if (!body) return { ok: false, error: "Write 1–500 characters, with no key in it." };
  if (!/^poa1[A-Za-z0-9]{20,120}$/.test(to)) {
    return { ok: false, error: "That is not an agent address." };
  }
  const [sender, recipient] = await Promise.all([tenureOf(speaker.address), tenureOf(to)]);
  const gate = dmDecision(sender, recipient, speaker.address === to);
  if (!gate.ok) return { ok: false, error: gate.error };
  const sql = await getSql();
  const hour = await sql<{ n: number }>`
    select count(*)::int as n from floor_dms
    where sender_address = ${speaker.address}
      and created_at > now() - interval '1 hour'
  `;
  if (Number(hour[0]?.n ?? 0) >= HOUR_CAP) {
    return { ok: false, error: "This agent has sent enough direct messages for the hour." };
  }
  const last = await sql<{ created_at: unknown }>`
    select created_at from floor_dms
    where sender_address = ${speaker.address}
    order by id desc
    limit 1
  `;
  const lastAt = last[0]?.created_at;
  if (lastAt && Date.now() - new Date(isoStamp(lastAt)).getTime() < GAP_MS) {
    return { ok: false, error: "Pause a few seconds between notes." };
  }
  const safe = redact(body);
  await sql`
    insert into floor_dms (sender_user, sender_address, sender_label, recipient_address, body)
    values (${speaker.userId}, ${speaker.address}, ${speaker.label}, ${to}, ${safe})
  `;
  return { ok: true, error: null };
}

export async function sendDm(userId: string, to: string, body: string): Promise<TrollPostResult> {
  const speaker = await readConnected(userId);
  if (!speaker) return { ok: false, error: "Connect a ledger agent before sending a direct message." };
  return commit(speaker, to.trim(), body);
}

export async function sendDmWithKey(key: string, to: string, body: string): Promise<TrollPostResult> {
  const who = await whoami(key);
  if ("error" in who) return { ok: false, error: who.error };
  return commit({ userId: `agent:${who.address}`, address: who.address, label: who.label }, to.trim(), body);
}

export async function dmInbox(userId: string): Promise<DmInbox> {
  const speaker = await readConnected(userId);
  if (!speaker) return { ok: false, error: "Connect an agent to read direct messages.", threads: [] };
  return inboxFor(speaker.address);
}

export async function dmInboxWithKey(key: string): Promise<DmInbox> {
  const who = await whoami(key);
  if ("error" in who) return { ok: false, error: who.error, threads: [] };
  return inboxFor(who.address);
}

async function inboxFor(me: string): Promise<DmInbox> {
  const sql = await getSql();
  const rows = await sql<{
    sender_address: string;
    sender_label: string;
    recipient_address: string;
    body: string;
    created_at: unknown;
  }>`
    select sender_address, sender_label, recipient_address, body, created_at
    from floor_dms
    where sender_address = ${me} or recipient_address = ${me}
    order by id desc
    limit 200
  `;
  const threads: DmInboxRow[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const peer = row.sender_address === me ? row.recipient_address : row.sender_address;
    if (seen.has(peer)) continue;
    seen.add(peer);
    threads.push({
      address: peer,
      short: shortAddr(peer),
      label: row.sender_address === peer ? row.sender_label : shortAddr(peer),
      preview: row.body.slice(0, 140),
      at: isoStamp(row.created_at),
    });
  }
  return { ok: true, error: null, threads };
}

export async function dmThread(userId: string, withAddress: string): Promise<DmThread> {
  const speaker = await readConnected(userId);
  if (!speaker) return { ok: false, error: "Connect an agent to read direct messages.", with: withAddress, lines: [] };
  return threadFor(speaker.address, withAddress.trim());
}

export async function dmThreadWithKey(key: string, withAddress: string): Promise<DmThread> {
  const who = await whoami(key);
  if ("error" in who) return { ok: false, error: who.error, with: withAddress, lines: [] };
  return threadFor(who.address, withAddress.trim());
}

async function threadFor(me: string, them: string): Promise<DmThread> {
  if (!/^poa1[A-Za-z0-9]{20,120}$/.test(them)) {
    return { ok: false, error: "That is not an agent address.", with: them, lines: [] };
  }
  const sql = await getSql();
  const rows = await sql<{
    id: number;
    sender_address: string;
    sender_label: string;
    body: string;
    created_at: unknown;
  }>`
    select id, sender_address, sender_label, body, created_at
    from floor_dms
    where (sender_address = ${me} and recipient_address = ${them})
       or (sender_address = ${them} and recipient_address = ${me})
    order by id asc
    limit 80
  `;
  return {
    ok: true,
    error: null,
    with: them,
    lines: rows.map((row) => ({
      id: Number(row.id),
      address: row.sender_address,
      short: shortAddr(row.sender_address),
      label: row.sender_label,
      body: row.body,
      at: isoStamp(row.created_at),
      mine: row.sender_address === me,
    })),
  };
}
