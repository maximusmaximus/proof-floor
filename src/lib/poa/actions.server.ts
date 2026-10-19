import { getSql } from "@/lib/db";
import { isoStamp } from "./format";
import {
  findPrefixed,
  parseAssignments,
  parseChallenge,
  parseHistory,
  parseNotes,
  parsePulse,
  parseStanding,
} from "./parse";
import { redact, scrub } from "./redact";
import type {
  ActionResult,
  DeskState,
  FloorEvent,
  GradeRecord,
  HistorySnapshot,
  NotesSnapshot,
  PulseSnapshot,
} from "./types";
import { poaGet } from "./upstream";

const GAP_MS = 4000;

type AgentRow = {
  label: string;
  poa_address: string;
  api_key: string;
};

function emptyAgent(): DeskState["agent"] {
  return { connected: false, label: null, address: null, hint: null };
}

function hintOf(key: string): string {
  return key.slice(-4);
}

async function readAgent(userId: string): Promise<AgentRow | null> {
  const sql = await getSql();
  const rows = await sql<AgentRow>`
    select label, poa_address, api_key from floor_agents where user_id = ${userId}
  `;
  return rows[0] ?? null;
}

async function logEvent(userId: string, kind: string, summary: string) {
  const sql = await getSql();
  const clean = redact(summary).slice(0, 180);
  await sql`
    insert into floor_events (user_id, kind, summary) values (${userId}, ${kind}, ${clean})
  `;
}

async function throttle(userId: string): Promise<string | null> {
  const sql = await getSql();
  const rows = await sql<{ last_at: unknown }>`
    select last_at from floor_throttle where user_id = ${userId}
  `;
  const last = rows[0]?.last_at;
  if (last) {
    const t = new Date(isoStamp(last)).getTime();
    if (Date.now() - t < GAP_MS) return "Pause a few seconds between network calls.";
  }
  await sql`
    insert into floor_throttle (user_id, last_at) values (${userId}, now())
    on conflict (user_id) do update set last_at = now()
  `;
  return null;
}

async function readEvents(userId: string): Promise<FloorEvent[]> {
  const sql = await getSql();
  const rows = await sql<{ id: number; kind: string; summary: string; created_at: unknown }>`
    select id, kind, summary, created_at from floor_events
    where user_id = ${userId}
    order by id desc
    limit 24
  `;
  return rows.map((r) => ({
    id: Number(r.id),
    kind: r.kind,
    summary: r.summary,
    at: isoStamp(r.created_at),
  }));
}

async function readGrades(userId: string): Promise<GradeRecord[]> {
  const sql = await getSql();
  const rows = await sql<{
    id: number;
    assignment: string;
    score: number;
    reasoning: string;
    created_at: unknown;
  }>`
    select id, assignment, score, reasoning, created_at from floor_grades
    where user_id = ${userId}
    order by id desc
    limit 12
  `;
  return rows.map((r) => ({
    id: Number(r.id),
    assignment: r.assignment,
    score: Number(r.score),
    reasoning: r.reasoning,
    at: isoStamp(r.created_at),
  }));
}

export async function buildDesk(userId: string, upstreamError: string | null = null): Promise<DeskState> {
  const agent = await readAgent(userId);
  const events = await readEvents(userId);
  const grades = await readGrades(userId);
  if (!agent) {
    return scrub({
      agent: emptyAgent(),
      challenge: null,
      standing: null,
      assignments: [],
      grades,
      events,
      upstreamError,
    });
  }
  let challenge = null;
  let standing = null;
  let assignments: DeskState["assignments"] = [];
  let err = upstreamError;
  try {
    const [challengeBody, meBody, seatsBody] = await Promise.all([
      poaGet("/api/hosted/challenge", { key: agent.api_key }, 14000),
      poaGet("/api/hosted/me", { key: agent.api_key }, 14000),
      poaGet("/api/hosted/assignments", { key: agent.api_key }, 14000).catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : "Grading seats did not load.";
        if (!err) err = msg;
        return { assignments: [] };
      }),
    ]);
    challenge = parseChallenge(challengeBody);
    const parsed = parseStanding(meBody);
    standing = {
      spendable: parsed.spendable,
      locked: parsed.locked,
      balance: parsed.balance,
      epoch: parsed.epoch ?? challenge.epoch,
      standing: parsed.standing,
      invite: parsed.invite,
    };
    if (parsed.address && parsed.address !== agent.poa_address && parsed.address.startsWith("poa1")) {
      const sql = await getSql();
      await sql`
        update floor_agents set poa_address = ${parsed.address}
        where user_id = ${userId}
      `;
    }
    assignments = parseAssignments(seatsBody);
  } catch (e) {
    err = e instanceof Error ? e.message : "The agent network did not answer.";
  }
  const fresh = await readAgent(userId);
  return scrub({
    agent: {
      connected: true,
      label: fresh?.label ?? agent.label,
      address: fresh?.poa_address ?? agent.poa_address,
      hint: hintOf(agent.api_key),
    },
    challenge,
    standing,
    assignments,
    grades,
    events: await readEvents(userId),
    upstreamError: err,
  });
}

function assertLabel(label: string): string | null {
  const clean = label.trim().replace(/\s+/g, " ");
  if (clean.length < 2 || clean.length > 40) return "Use a name between 2 and 40 characters.";
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(clean)) {
    return "Use letters, numbers, spaces, dots, or hyphens.";
  }
  return null;
}

export async function connectAgent(userId: string, key: string): Promise<ActionResult> {
  const existing = await readAgent(userId);
  if (existing) {
    return {
      ok: false,
      error: "This operator already has one agent. Clones earn nothing — remove it first only if that key is lost.",
    };
  }
  const trimmed = key.trim();
  if (!/^pk_[A-Za-z0-9_-]{8,180}$/.test(trimmed)) {
    return { ok: false, error: "That does not look like a pk_ agent key." };
  }
  const wait = await throttle(userId);
  if (wait) return { ok: false, error: wait };
  try {
    const me = parseStanding(await poaGet("/api/hosted/me", { key: trimmed }, 14000));
    const address = me.address && me.address.startsWith("poa1") ? me.address : "poa1-unknown";
    const label = me.label ?? "agent";
    const sql = await getSql();
    await sql`
      insert into floor_agents (user_id, label, poa_address, api_key)
      values (${userId}, ${label.slice(0, 40)}, ${address}, ${trimmed})
    `;
    await logEvent(userId, "connect", `Connected ${label} ${address === "poa1-unknown" ? "" : address}`.trim());
    return { ok: true, error: null, desk: await buildDesk(userId) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not connect that agent." };
  }
}

export async function registerAgent(
  userId: string,
  label: string,
  invitedBy: string,
): Promise<ActionResult> {
  const existing = await readAgent(userId);
  if (existing) {
    return { ok: false, error: "This operator already has one agent. A second identity would be kin-linked and earn nothing." };
  }
  const bad = assertLabel(label);
  if (bad) return { ok: false, error: bad };
  const ref = invitedBy.trim();
  if (ref && !/^poa1[1-9A-HJ-NP-Za-km-z]{20,90}$/.test(ref)) {
    return { ok: false, error: "Invite codes look like poa1… Leave it blank if you were not invited." };
  }
  const wait = await throttle(userId);
  if (wait) return { ok: false, error: wait };
  const clean = label.trim().replace(/\s+/g, " ");
  try {
    const params: Record<string, string> = { label: clean };
    if (ref) params.invited_by = ref;
    const body = await poaGet("/api/hosted/register", params, 16000);
    const apiKey = findPrefixed(body, "pk_");
    if (!apiKey || !/^pk_[A-Za-z0-9_-]{8,180}$/.test(apiKey)) {
      return {
        ok: false,
        error: "The network answered without a key. Nothing was stored. If a page showed a key, save it offline — do not paste it into chat.",
        revealKey: null,
      };
    }
    let address = findPrefixed(body, "poa1");
    if (!address) {
      try {
        address = parseStanding(await poaGet("/api/hosted/me", { key: apiKey }, 12000)).address;
      } catch {
        address = null;
      }
    }
    const sql = await getSql();
    await sql`
      insert into floor_agents (user_id, label, poa_address, api_key)
      values (${userId}, ${clean}, ${address && address.startsWith("poa1") ? address : "poa1-pending"}, ${apiKey})
    `;
    await logEvent(userId, "register", `Registered ${clean}`);
    return { ok: true, error: null, revealKey: apiKey, desk: await buildDesk(userId) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Registration failed.", revealKey: null };
  }
}

export async function disconnectAgent(userId: string): Promise<ActionResult> {
  const sql = await getSql();
  await sql`delete from floor_agents where user_id = ${userId}`;
  await logEvent(userId, "disconnect", "Removed the agent key from this desk");
  return { ok: true, error: null, desk: await buildDesk(userId) };
}

function wordsMissing(answer: string, words: string[]): string[] {
  const hay = answer.toLowerCase();
  return words.filter((w) => !hay.includes(w.toLowerCase()));
}

export async function submitAnswer(userId: string, answer: string): Promise<ActionResult> {
  const agent = await readAgent(userId);
  if (!agent) return { ok: false, error: "Connect one agent first." };
  const text = answer.trim();
  if (text.length < 120 || text.length > 600) {
    return { ok: false, error: "Answers must be 120–600 characters." };
  }
  if (/pk_[A-Za-z0-9_-]{4,}/.test(text)) {
    return { ok: false, error: "Do not put a key in an answer." };
  }
  const wait = await throttle(userId);
  if (wait) return { ok: false, error: wait };
  try {
    const challenge = parseChallenge(await poaGet("/api/hosted/challenge", { key: agent.api_key }));
    if (challenge.answered === true) {
      return { ok: false, error: "This epoch is already answered. Wait for the next one.", desk: await buildDesk(userId) };
    }
    if (challenge.words.length === 3) {
      const missing = wordsMissing(text, challenge.words);
      if (missing.length) {
        return { ok: false, error: `Missing seeded word${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.` };
      }
    }
    await poaGet("/api/hosted/answer", { key: agent.api_key, answer: text }, 16000);
    await logEvent(userId, "answer", `Filed an answer (${text.length} characters)`);
    return { ok: true, error: null, desk: await buildDesk(userId) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "The answer was rejected." };
  }
}

export async function attest(userId: string): Promise<ActionResult> {
  const agent = await readAgent(userId);
  if (!agent) return { ok: false, error: "Connect one agent first." };
  const wait = await throttle(userId);
  if (wait) return { ok: false, error: wait };
  try {
    await poaGet("/api/hosted/mine", { key: agent.api_key }, 20000);
    await logEvent(userId, "attest", "Attested pending transactions");
    return { ok: true, error: null, desk: await buildDesk(userId) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Attest failed." };
  }
}

export async function gradeSeat(
  userId: string,
  assignment: string,
  score: number,
  reasoning: string,
): Promise<ActionResult> {
  const agent = await readAgent(userId);
  if (!agent) return { ok: false, error: "Connect one agent first." };
  const id = assignment.trim();
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(id)) return { ok: false, error: "That seat id does not look valid." };
  if (!Number.isInteger(score) || score < 0 || score > 3) return { ok: false, error: "Score must be 0, 1, 2, or 3." };
  const why = reasoning.trim().replace(/\s+/g, " ");
  if (why.length < 12 || why.length > 280) {
    return { ok: false, error: "Write a specific reason, one sentence (12–280 characters)." };
  }
  const wait = await throttle(userId);
  if (wait) return { ok: false, error: wait };
  try {
    await poaGet(
      "/api/hosted/grade",
      { key: agent.api_key, assignment: id, score: String(score), reasoning: why },
      16000,
    );
    const sql = await getSql();
    await sql`
      insert into floor_grades (user_id, assignment, score, reasoning)
      values (${userId}, ${id}, ${score}, ${why})
    `;
    await logEvent(userId, "grade", `Sealed grade ${score} on ${id.slice(0, 10)}…`);
    return { ok: true, error: null, desk: await buildDesk(userId) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "The grade was rejected." };
  }
}

export async function castVote(
  userId: string,
  ballot: string,
  topic: string,
  choice: string,
): Promise<ActionResult> {
  const agent = await readAgent(userId);
  if (!agent) return { ok: false, error: "Connect one agent first." };
  const b = ballot.trim();
  const t = topic.trim();
  const c = choice.trim();
  if (!/^[A-Za-z0-9_.:-]{2,128}$/.test(b)) return { ok: false, error: "Check the ballot id." };
  if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(t)) return { ok: false, error: "Check the topic id." };
  if (!c || c.length > 80) return { ok: false, error: "Choose one option." };
  const wait = await throttle(userId);
  if (wait) return { ok: false, error: wait };
  try {
    await poaGet(
      "/api/hosted/vote",
      { key: agent.api_key, ballot: b, topic: t, choice: c },
      16000,
    );
    await logEvent(userId, "vote", `Voted on ${b.slice(0, 12)}…`);
    return { ok: true, error: null, desk: await buildDesk(userId) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "The vote was rejected." };
  }
}

let pulseCache: { at: number; data: PulseSnapshot } | null = null;
let pulseFlight: Promise<PulseSnapshot> | null = null;

export function loadPulse(): Promise<PulseSnapshot> {
  if (pulseCache && Date.now() - pulseCache.at < 20000) return Promise.resolve(pulseCache.data);
  if (pulseFlight) return pulseFlight;
  pulseFlight = (async () => {
    try {
      const [statusBody, networksBody] = await Promise.all([
        poaGet("/api/status", {}, 8000),
        poaGet("/api/networks", {}, 8000).catch(() => ({})),
      ]);
      const data = parsePulse(statusBody, networksBody);
      if (data.ok) pulseCache = { at: Date.now(), data };
      return data;
    } catch (e) {
      if (pulseCache) return pulseCache.data;
      return {
        ok: false,
        error: e instanceof Error ? e.message : "The network did not answer.",
        network: "Proof of Agent",
        chainId: "",
        supply: "",
        agentsJoined: null,
        epochsClosed: null,
        holders: null,
        txs: null,
        finalTxs: null,
        checkpoint: null,
        stateRoot: "",
        asOf: null,
      };
    } finally {
      pulseFlight = null;
    }
  })();
  return pulseFlight;
}

let historyCache: { at: number; data: HistorySnapshot } | null = null;
let historyFlight: Promise<HistorySnapshot> | null = null;

export function loadHistory(): Promise<HistorySnapshot> {
  if (historyCache && Date.now() - historyCache.at < 55000) return Promise.resolve(historyCache.data);
  if (historyFlight) return historyFlight;
  historyFlight = (async () => {
    try {
      const body = await poaGet("/api/epochs", {}, 25000);
      const data = parseHistory(body);
      if (data.ok) historyCache = { at: Date.now(), data };
      return data;
    } catch (e) {
      if (historyCache) return historyCache.data;
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Epoch history did not answer.",
        lastEpoch: null,
        answers: 0,
        graders: 0,
        slashed: 0,
        ejected: 0,
        recent: [],
        attesters: [],
        graderRows: [],
      };
    } finally {
      historyFlight = null;
    }
  })();
  return historyFlight;
}

let notesCache: { at: number; data: NotesSnapshot } | null = null;
let notesFlight: Promise<NotesSnapshot> | null = null;

export function loadNotes(): Promise<NotesSnapshot> {
  if (notesCache && Date.now() - notesCache.at < 30000) return Promise.resolve(notesCache.data);
  if (notesFlight) return notesFlight;
  notesFlight = (async () => {
    const [noticesRes, ballotsRes] = await Promise.allSettled([
      poaGet("/api/notices", {}, 8000),
      poaGet("/api/ballots", {}, 8000),
    ]);
    const noticesBody = noticesRes.status === "fulfilled" ? noticesRes.value : null;
    const ballotsBody = ballotsRes.status === "fulfilled" ? ballotsRes.value : null;
    const parsed = parseNotes(noticesBody, ballotsBody ?? {});
    const data: NotesSnapshot = scrub({
      ok: ballotsRes.status === "fulfilled" || noticesRes.status === "fulfilled",
      error:
        noticesRes.status === "rejected" && ballotsRes.status === "rejected"
          ? "Notices and ballots did not answer."
          : null,
      notices: parsed.notices,
      ballots: parsed.ballots,
      ballotNote: parsed.ballotNote,
    });
    if (data.ok) notesCache = { at: Date.now(), data };
    notesFlight = null;
    return data;
  })();
  return notesFlight;
}
