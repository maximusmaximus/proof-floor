import { shortAddr } from "./format.ts";
import { asRecord } from "./parse.ts";
import type { FlowTx } from "./types";

const ADDR = /^poa1[A-Za-z0-9]{20,120}$/;

const LABELS: Record<string, string> = {
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
};

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function clip(id: string): string {
  return id.length <= 12 ? id : id.slice(0, 8);
}

function target(id: string): { id: string; short: string } {
  return { id, short: ADDR.test(id) ? shortAddr(id) : clip(id) };
}

export function readFlowItem(item: unknown, detail: unknown): FlowTx | null {
  const list = asRecord(item);
  const extra = asRecord(detail);
  const o = extra ?? list;
  if (!o) return null;
  const id = text(o.id) || text(list?.id);
  const ts = num(o.ts) ?? num(list?.ts);
  if (!id || ts == null) return null;
  const body = asRecord(o.body) ?? asRecord(list?.body) ?? {};
  const type = text(o.type) || text(body.type) || text(list?.type) || "tx";
  const from = text(o.from_addr) || text(body.from) || text(list?.from_addr);
  const to = text(o.to_addr) || text(body.to_addr) || text(body.to);
  const epoch = num(o.epoch) ?? num(body.epoch) ?? num(list?.epoch);
  const amount = text(o.amount) || text(body.amount) || text(list?.amount);

  let going = "The ledger";
  let targets: { id: string; short: string }[] = [];
  if (ADDR.test(to)) {
    going = shortAddr(to);
    targets = [target(to)];
  } else if (type === "challenge" || type === "answer") {
    going = epoch != null ? `Epoch ${epoch}` : "The open epoch";
  } else if (text(body.assignment)) {
    const seat = text(body.assignment);
    going = `Seat ${clip(seat)}`;
    targets = [target(seat)];
  } else if (Array.isArray(body.atts)) {
    const ids = body.atts
      .map((row) => text(asRecord(row)?.txid))
      .filter((row) => row.length > 0);
    if (ids.length) {
      going = `${ids.length} transaction${ids.length === 1 ? "" : "s"}`;
      targets = ids.map(target);
    }
  } else if (text(body.ballot) || text(body.ballot_id)) {
    const ballot = text(body.ballot) || text(body.ballot_id);
    going = `Ballot ${clip(ballot)}`;
    targets = [target(ballot)];
  } else if (epoch != null) {
    going = `Epoch ${epoch}`;
  } else if (type === "grade-sealed") {
    going = "A grading seat";
  } else if (type === "attest-batch" || type === "attest") {
    going = "Attestations";
  }

  const finalRaw = o.final ?? list?.final;
  return {
    id,
    type,
    label: LABELS[type] ?? type.replace(/-/g, " "),
    from: ADDR.test(from) ? from : "",
    fromShort: ADDR.test(from) ? shortAddr(from) : "—",
    to: ADDR.test(to) ? to : "",
    going,
    amount,
    at: new Date(ts * 1000).toISOString(),
    final: finalRaw === true || finalRaw === 1 || finalRaw === "1",
    targets,
  };
}

export function readFlow(body: unknown): FlowTx[] {
  const list = Array.isArray(body) ? body : Array.isArray(asRecord(body)?.txs) ? (asRecord(body)?.txs as unknown[]) : [];
  const out: FlowTx[] = [];
  for (const item of list) {
    const row = readFlowItem(item, null);
    if (row) out.push(row);
  }
  return out;
}
