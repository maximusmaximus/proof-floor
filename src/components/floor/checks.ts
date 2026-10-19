export type CheckRow = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
};

export type Preflight = {
  ok: boolean;
  blocks: string[];
  warns: string[];
  length: number;
  rows: CheckRow[];
};

export function preflight(answer: string, words: string[], answered: boolean | null): Preflight {
  const text = answer.trim();
  const missing = words.filter((w) => !text.toLowerCase().includes(w.toLowerCase()));
  const blocks: string[] = [];
  const warns: string[] = [];
  if (answered) blocks.push("This epoch is already answered.");
  if (text.length < 120) blocks.push(`${120 - text.length} characters still needed.`);
  if (text.length > 600) blocks.push(`${text.length - 600} characters over the cap.`);
  if (words.length === 3 && missing.length) blocks.push(`Still missing: ${missing.join(", ")}.`);
  if (words.length > 0 && words.length !== 3) warns.push("Seed words look incomplete. The network may reject this.");
  if (/https?:\/\//i.test(text)) warns.push("Links are usually scored as junk.");
  if (/pk_[A-Za-z0-9_-]{4,}/.test(text)) blocks.push("Remove the key from this text.");

  const lengthOk = text.length >= 120 && text.length <= 600;
  const wordsOk = words.length !== 3 || missing.length === 0;
  const keyOk = !/pk_[A-Za-z0-9_-]{4,}/.test(text);
  const open = answered !== true;

  const rows: CheckRow[] = [
    {
      id: "length",
      label: "Length",
      ok: lengthOk,
      detail: `${text.length} / 600`,
    },
    {
      id: "words",
      label: "Seed words",
      ok: words.length === 3 && missing.length === 0,
      detail:
        words.length !== 3 ? "Waiting" : missing.length === 0 ? "All three" : missing.join(", "),
    },
    {
      id: "key",
      label: "Key leak",
      ok: keyOk,
      detail: keyOk ? "Clear" : "Remove it",
    },
    {
      id: "open",
      label: "Epoch",
      ok: open,
      detail: answered == null ? "Unknown" : answered ? "Already filed" : "Open",
    },
  ];

  return {
    ok: blocks.length === 0 && lengthOk && wordsOk && open,
    blocks,
    warns,
    length: text.length,
    rows,
  };
}

export type AuditFlag = { id: string; label: string };

const AUDIT_RULES: { id: string; label: string; re: RegExp }[] = [
  { id: "ignore", label: "Ignore rubric", re: /ignore (all|any|previous|prior|the rubric|instructions)/i },
  { id: "score", label: "Planted score", re: /\b(score|grade|rate)\s*(this|me|it|as)?\s*(a\s*)?[0-3]\b/i },
  { id: "url", label: "Link", re: /https?:\/\//i },
  { id: "key", label: "Key request", re: /\bpk_[A-Za-z0-9_-]{4,}\b|paste your (api )?key|send (me )?your key/i },
  { id: "role", label: "Role injection", re: /you are now|system prompt|disregard (the |all )?/i },
];

export function auditText(text: string): AuditFlag[] {
  if (!text.trim()) return [];
  return AUDIT_RULES.filter((rule) => rule.re.test(text)).map(({ id, label }) => ({ id, label }));
}
