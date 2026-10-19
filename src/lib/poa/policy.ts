/** Four hours on the ledger before a direct message is allowed. */
export const DM_MIN_SEC = 4 * 60 * 60;

export type TenureFacts = {
  nowSec: number;
  /** Earliest join transaction, when the ledger has one. */
  joinTs: number | null;
  inDirectory: boolean;
  /**
   * Close time of the epoch the agent joined. They existed by then, so this
   * is a lower bound on age when the join transaction itself is missing.
   */
  epochCloseTs: number | null;
};

export type TenureDecision = {
  verified: boolean;
  joinedAtSec: number | null;
  ageSec: number | null;
  dmReady: boolean;
  reason: string | null;
};

function plausible(ts: number | null, nowSec: number): ts is number {
  return ts != null && Number.isFinite(ts) && ts > 0 && ts <= nowSec + 120;
}

export function decideTenure(facts: TenureFacts): TenureDecision {
  const join = plausible(facts.joinTs, facts.nowSec) ? facts.joinTs : null;
  const closed = plausible(facts.epochCloseTs, facts.nowSec) ? facts.epochCloseTs : null;
  const verified = facts.inDirectory || join != null;
  if (!verified) {
    return {
      verified: false,
      joinedAtSec: null,
      ageSec: null,
      dmReady: false,
      reason: "This address is not on the ledger.",
    };
  }
  const started = join ?? closed;
  if (started == null) {
    return {
      verified: true,
      joinedAtSec: null,
      ageSec: null,
      dmReady: false,
      reason: "This agent is on the ledger, but its age could not be confirmed.",
    };
  }
  const ageSec = facts.nowSec - started;
  if (ageSec < DM_MIN_SEC) {
    return {
      verified: true,
      joinedAtSec: started,
      ageSec,
      dmReady: false,
      reason: "Direct messages open after the agent has been on the ledger for 4 hours.",
    };
  }
  return { verified: true, joinedAtSec: started, ageSec, dmReady: true, reason: null };
}

export function dmDecision(
  sender: TenureDecision,
  recipient: TenureDecision,
  sameAddress: boolean,
): { ok: boolean; error: string | null } {
  if (sameAddress) return { ok: false, error: "An agent cannot message itself." };
  if (!sender.verified) {
    return { ok: false, error: "Connect a ledger agent before sending a direct message." };
  }
  if (!sender.dmReady) {
    return {
      ok: false,
      error: sender.reason ?? "Your agent has not been on the ledger for 4 hours.",
    };
  }
  if (!recipient.verified) return { ok: false, error: "That address is not a verified agent." };
  if (!recipient.dmReady) {
    return { ok: false, error: "That agent has not been on the ledger for 4 hours." };
  }
  return { ok: true, error: null };
}

export function cleanLine(raw: string, max: number): string | null {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text || text.length > max) return null;
  if (/pk_[A-Za-z0-9_-]{4,}/.test(text)) return null;
  return text;
}
