import { shortAddr } from "./format";
import type {
  AssignmentView,
  BallotView,
  ChallengeView,
  EpochPoint,
  HistorySnapshot,
  NoticeView,
  PersonCount,
  PulseSnapshot,
  StandingView,
} from "./types";

export function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export function pickLoose(o: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    if (typeof v === "boolean") return v ? "yes" : "no";
  }
  return null;
}

function digWords(v: unknown, depth = 0): string[] | null {
  if (depth > 6 || v == null) return null;
  const o = asRecord(v);
  if (!o) {
    if (!Array.isArray(v)) return null;
    for (const item of v) {
      const found = digWords(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  for (const key of ["words", "required_words", "seed_words", "seeds", "required"]) {
    const val = o[key];
    if (typeof val === "string") {
      const parts = val
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length >= 3 && parts.length <= 6 && parts.every((p) => p.length < 40)) {
        return parts.slice(0, 3);
      }
    }
    if (
      Array.isArray(val) &&
      val.length >= 3 &&
      val.length <= 8 &&
      val.every((x) => typeof x === "string" && x.trim().length > 0 && x.trim().length < 40)
    ) {
      return val.slice(0, 3).map((s) => (s as string).trim());
    }
  }
  for (const val of Object.values(o)) {
    if (val && typeof val === "object") {
      const found = digWords(val, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function digBool(v: unknown, keys: string[], depth = 0): boolean | null {
  if (depth > 6 || v == null) return null;
  const o = asRecord(v);
  if (!o) {
    if (Array.isArray(v)) {
      for (const item of v) {
        const found = digBool(item, keys, depth + 1);
        if (found != null) return found;
      }
    }
    return null;
  }
  for (const key of keys) {
    const val = o[key];
    if (typeof val === "boolean") return val;
    if (val === "true" || val === "yes") return true;
    if (val === "false" || val === "no") return false;
  }
  for (const val of Object.values(o)) {
    if (val && typeof val === "object") {
      const found = digBool(val, keys, depth + 1);
      if (found != null) return found;
    }
  }
  return null;
}

function digString(v: unknown, keys: string[], depth = 0): string | null {
  if (depth > 5 || v == null) return null;
  const o = asRecord(v);
  if (!o) return null;
  const direct = pickLoose(o, keys);
  if (direct) return direct;
  for (const val of Object.values(o)) {
    if (val && typeof val === "object") {
      const found = digString(val, keys, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

export function findPrefixed(v: unknown, prefix: string, depth = 0): string | null {
  if (depth > 6 || v == null) return null;
  if (typeof v === "string" && v.startsWith(prefix) && v.length < 200) return v.trim();
  if (Array.isArray(v)) {
    for (const item of v) {
      const found = findPrefixed(item, prefix, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const o = asRecord(v);
  if (!o) return null;
  for (const val of Object.values(o)) {
    const found = findPrefixed(val, prefix, depth + 1);
    if (found) return found;
  }
  return null;
}

export function parseChallenge(body: unknown): ChallengeView {
  const o = asRecord(body);
  return {
    words: digWords(body) ?? [],
    answered: digBool(body, ["answered", "already_answered", "did_answer"]),
    epoch: o ? pickLoose(o, ["epoch", "epoch_id", "current_epoch"]) : digString(body, ["epoch"]),
    prompt: o
      ? pickLoose(o, ["prompt", "challenge", "question", "instruction", "text"])
      : null,
  };
}

export function parseStanding(body: unknown): StandingView & { address: string | null; label: string | null } {
  const o = asRecord(body) ?? {};
  const bal = asRecord(o.balance) ?? asRecord(o.balances) ?? o;
  const established = o.established;
  let standing = pickLoose(o, ["standing", "status", "role"]);
  if (!standing && typeof established === "boolean") {
    standing = established ? "established" : "not established";
  }
  return {
    spendable: pickLoose(bal, ["spendable"]) ?? pickLoose(o, ["spendable"]),
    locked: pickLoose(bal, ["locked", "vesting", "unvested"]) ?? pickLoose(o, ["locked"]),
    balance: pickLoose(bal, ["balance", "total", "amount"]) ?? pickLoose(o, ["balance", "total"]),
    epoch: pickLoose(o, ["epoch", "current_epoch"]),
    standing,
    invite: pickLoose(o, ["invite", "invite_link", "invite_url", "referral", "ref_link"]),
    address: pickLoose(o, ["address", "poa_address", "poa", "account"]) ?? findPrefixed(body, "poa1"),
    label: pickLoose(o, ["label", "name"]),
  };
}

function assignmentFrom(item: unknown, index: number): AssignmentView | null {
  if (typeof item === "string" && item.trim()) {
    return { id: item.trim(), text: "", epoch: null };
  }
  const o = asRecord(item);
  if (!o) return null;
  const id =
    pickLoose(o, ["id", "txid", "assignment", "assignment_id", "tx", "answer_id", "answer_txid"]) ??
    `seat-${index + 1}`;
  const text =
    pickLoose(o, ["answer", "text", "body", "content", "response", "submission"]) ??
    (() => {
      const nested = asRecord(o.answer) ?? asRecord(o.submission);
      return nested ? pickLoose(nested, ["text", "body", "content", "answer"]) : null;
    })() ??
    "";
  return {
    id: id.slice(0, 128),
    text: text.slice(0, 2000),
    epoch: pickLoose(o, ["epoch", "answer_epoch"]),
  };
}

export function parseAssignments(body: unknown): AssignmentView[] {
  const o = asRecord(body);
  const list = Array.isArray(body)
    ? body
    : o
      ? (["assignments", "seats", "items", "pending", "queue"]
          .map((k) => o[k])
          .find((v) => Array.isArray(v)) as unknown[] | undefined) ?? []
      : [];
  const out: AssignmentView[] = [];
  list.forEach((item, i) => {
    const row = assignmentFrom(item, i);
    if (row && row.id) out.push(row);
  });
  return out.slice(0, 20);
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export function parsePulse(statusBody: unknown, networksBody: unknown): PulseSnapshot {
  const s = asRecord(statusBody) ?? {};
  const n = asRecord(networksBody) ?? {};
  const root = typeof s.state_root === "string" ? s.state_root : "";
  return {
    ok: Object.keys(s).length > 0,
    error: Object.keys(s).length > 0 ? null : "The network status did not answer.",
    network: typeof s.network === "string" ? s.network : "Proof of Agent",
    chainId: typeof n.default_chain === "string" ? n.default_chain : "",
    supply: typeof s.supply === "string" ? s.supply : s.supply != null ? String(s.supply) : "",
    agentsJoined: num(s.agents_joined),
    epochsClosed: num(s.epochs_closed),
    holders: num(s.holders),
    txs: num(s.txs),
    finalTxs: num(s.final),
    checkpoint: num(s.checkpoint_height),
    stateRoot: root,
    asOf: typeof s.as_of === "string" ? s.as_of : null,
  };
}

function countMap(v: unknown): PersonCount[] {
  const o = asRecord(v);
  if (!o) return [];
  const rows: PersonCount[] = [];
  for (const [address, count] of Object.entries(o)) {
    const n = num(count);
    if (n == null || !address.startsWith("poa1")) continue;
    rows.push({ address, short: shortAddr(address), count: n });
  }
  rows.sort((a, b) => b.count - a.count);
  return rows.slice(0, 6);
}

function sumNums(v: unknown): number {
  const o = asRecord(v);
  if (!o) return 0;
  let total = 0;
  for (const val of Object.values(o)) {
    const n = num(val);
    if (n != null) total += n;
  }
  return total;
}

export function parseHistory(body: unknown): HistorySnapshot {
  if (!Array.isArray(body) || body.length === 0) {
    return {
      ok: false,
      error: "Epoch history did not answer.",
      lastEpoch: null,
      answers: 0,
      graders: 0,
      slashed: 0,
      ejected: 0,
      recent: [],
      attesters: [],
      graderRows: [],
    };
  }
  const recent: EpochPoint[] = body.slice(-18).map((row) => {
    const o = asRecord(row) ?? {};
    const basis = asRecord(o.basis) ?? {};
    const challenges = asRecord(o.challenges);
    return {
      epoch: num(o.epoch) ?? 0,
      attestations: sumNums(basis.attestations),
      answers: challenges ? Object.keys(challenges).length : 0,
      graders: asRecord(basis.graders_served) ? Object.keys(asRecord(basis.graders_served) ?? {}).length : 0,
      slashed: Array.isArray(basis.slashed) ? basis.slashed.length : 0,
    };
  });
  const last = asRecord(body[body.length - 1]) ?? {};
  const basis = asRecord(last.basis) ?? {};
  const challenges = asRecord(last.challenges);
  return {
    ok: true,
    error: null,
    lastEpoch: num(last.epoch),
    answers: challenges ? Object.keys(challenges).length : 0,
    graders: asRecord(basis.graders_served) ? Object.keys(asRecord(basis.graders_served) ?? {}).length : 0,
    slashed: Array.isArray(basis.slashed) ? basis.slashed.length : 0,
    ejected: Array.isArray(basis.ejected) ? basis.ejected.length : 0,
    recent,
    attesters: countMap(basis.attestations),
    graderRows: countMap(basis.graders_served),
  };
}

function parseTopics(v: unknown): BallotView["topics"] {
  const topics: BallotView["topics"] = [];
  if (Array.isArray(v)) {
    v.forEach((item, i) => {
      const o = asRecord(item);
      if (!o) return;
      const optionsRaw = o.options ?? o.choices ?? o.answers;
      const tallyRec = asRecord(o.tally);
      const options = Array.isArray(optionsRaw)
        ? optionsRaw
            .map((opt) => {
              if (typeof opt === "string") return opt;
              const rec = asRecord(opt);
              return rec ? pickLoose(rec, ["id", "label", "name", "option"]) : null;
            })
            .filter((x): x is string => Boolean(x))
            .slice(0, 8)
        : tallyRec
          ? Object.keys(tallyRec).slice(0, 8)
          : [];
      topics.push({
        id: pickLoose(o, ["id", "topic", "topic_id"]) ?? `topic-${i + 1}`,
        prompt: pickLoose(o, ["title", "prompt", "question", "text", "name"]) ?? `Topic ${i + 1}`,
        options,
      });
    });
    return topics;
  }
  const mapObj = asRecord(v);
  if (!mapObj) return [];
  for (const [topicId, rawVal] of Object.entries(mapObj)) {
    const o = asRecord(rawVal) ?? {};
    const optionsRaw = o.options ?? o.choices ?? o.answers;
    const tallyRec = asRecord(o.tally);
    const options = Array.isArray(optionsRaw)
      ? optionsRaw
          .map((opt) => {
            if (typeof opt === "string") return opt;
            const rec = asRecord(opt);
            return rec ? pickLoose(rec, ["id", "label", "name", "option"]) : null;
          })
          .filter((x): x is string => Boolean(x))
          .slice(0, 8)
      : tallyRec
        ? Object.keys(tallyRec).slice(0, 8)
        : [];
    const winner = pickLoose(o, ["winner"]);
    const basePrompt = pickLoose(o, ["title", "prompt", "question", "text", "name"]) ?? topicId;
    topics.push({
      id: topicId,
      prompt: winner ? `${basePrompt} (leading: ${winner})` : basePrompt,
      options,
    });
  }
  return topics;
}

export function parseNotes(noticesBody: unknown, ballotsBody: unknown): {
  notices: NoticeView[];
  ballots: BallotView[];
  ballotNote: string;
  noticesOk: boolean;
  ballotsOk: boolean;
} {
  const noticesRoot = asRecord(noticesBody);
  const noticeList = noticesRoot && Array.isArray(noticesRoot.active)
    ? noticesRoot.active
    : Array.isArray(noticesBody)
      ? noticesBody
      : [];
  const notices: NoticeView[] = [];
  for (const item of noticeList) {
    const o = asRecord(item);
    if (!o) continue;
    const msg = pickLoose(o, ["msg", "message", "text"]);
    if (!msg) continue;
    notices.push({
      id: pickLoose(o, ["id"]) ?? msg.slice(0, 24),
      severity: pickLoose(o, ["severity"]) ?? "info",
      msg: msg.slice(0, 700),
    });
  }
  const ballotsRoot = asRecord(ballotsBody);
  const ballotList = ballotsRoot && Array.isArray(ballotsRoot.ballots)
    ? ballotsRoot.ballots
    : Array.isArray(ballotsBody)
      ? ballotsBody
      : [];
  const ballots: BallotView[] = [];
  ballotList.forEach((item, i) => {
    const o = asRecord(item);
    if (!o) return;
    ballots.push({
      id: pickLoose(o, ["id", "ballot_id", "txid"]) ?? `ballot-${i + 1}`,
      title: pickLoose(o, ["title", "name", "question"]) ?? "Open ballot",
      phase: pickLoose(o, ["phase", "status", "window"]) ?? "",
      topics: parseTopics(o.topics ?? o.questions ?? o.items),
    });
  });
  return {
    notices: notices.slice(0, 6),
    ballots: ballots.slice(0, 6),
    ballotNote: ballotsRoot ? pickLoose(ballotsRoot, ["note"]) ?? "" : "",
    noticesOk: noticesBody != null && !(noticesBody instanceof Error),
    ballotsOk: ballotsBody != null,
  };
}
