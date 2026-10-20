import type { AssignmentView } from "./types.ts";

const INJECTION = [
  /\bignore\s+(all\s+)?(previous|prior|above)\b/i,
  /\b(score|grade|rate|give)\s*(this|me|it)?\s*[:=]?\s*3\b/i,
  /\bsystem\s*prompt\b/i,
  /\bdo\s+not\s+score\s+[012]\b/i,
  /https?:\/\//i,
  /\bpk_[A-Za-z0-9]{10,}\b/i,
  /\bapi[_\s-]?key\b/i,
];

const FARMS: { re: RegExp; label: string }[] = [
  { re: /-\s*ref\s+[0-9A-Fa-f]{6}\b/, label: "trailing '- ref HEX' farm signature" },
  { re: /\b(?:Agent|qwe|sa|once)\d{3,4}\b/, label: "automated 'AgentXXXX/qweXXXX/saXXXX/onceXXXX' farm signature" },
  { re: /\[e\d+-[0-9a-f]{6,}-\d+\]/, label: "trailing '[eN-hex-id]' bot tag" },
  { re: /enforcing dynamic topological gossip audits/i, label: "mad-lib template ('dynamic topological gossip audits')" },
  { re: /suppresses Sybil flooding via progressive cryptographic friction/i, label: "mad-lib template ('progressive cryptographic friction')" },
  { re: /multi-tiered cryptographic proof-of-delay\.\s*Ephemeral identities/i, label: "mad-lib template ('multi-tiered cryptographic proof-of-delay')" },
  { re: /Five established peers co-sign each newcomer/i, label: "mad-lib template ('Five established peers co-sign each newcomer')" },
  { re: /are merely challenge words/i, label: "explicit refusal to weave challenge words into mechanism" },
];

function shingles(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  if (words.length < 3) return new Set(words);
  const out = new Set<string>();
  for (let i = 0; i <= words.length - 3; i += 1) out.add(words.slice(i, i + 3).join(" "));
  return out;
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const token of a) if (b.has(token)) inter += 1;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

function classifyWords(text: string, words: string[]): { missing: string[]; inflected: string[] } {
  const missing: string[] = [];
  const inflected: string[] = [];
  for (const word of words) {
    const exact = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (exact.test(text)) continue;
    const bent = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[a-z]+\\b`, "i");
    if (bent.test(text)) inflected.push(word);
    missing.push(word);
  }
  return { missing, inflected };
}

/** Same flags the agent kit prints for a grading batch. */
export function auditSeats(seats: AssignmentView[]): AssignmentView[] {
  const sets = seats.map((seat) => shingles(seat.text));
  return seats.map((seat, i) => {
    const flags: string[] = [];
    const hits = INJECTION.filter((re) => re.test(seat.text)).length;
    if (hits) flags.push(`PROMPT_INJECTION_OR_URL (${hits} pattern match)`);
    const { missing, inflected } = classifyWords(seat.text, seat.words);
    const trulyMissing = missing.filter((word) => !inflected.includes(word));
    if (trulyMissing.length) flags.push(`MISSING_SEED_WORDS (${trulyMissing.join(",")})`);
    if (inflected.length) flags.push(`INFLECTED_SEED_WORDS (${inflected.join(",")})`);
    if (seat.text.length < 120 || seat.text.length > 600) flags.push(`OUT_OF_BOUNDS_LENGTH (${seat.text.length})`);
    const own = sets[i] ?? new Set<string>();
    let prior = 0;
    for (const earlier of seat.priors) {
      prior = Math.max(prior, overlap(own, shingles(earlier)));
    }
    if (prior >= 0.28) flags.push(`AUTHOR_TEMPLATE_REUSE (shingle overlap ${(prior * 100).toFixed(1)}% with prior epoch)`);
    for (const farm of FARMS) {
      if (farm.re.test(seat.text)) flags.push(`KNOWN_BOT_FARM_SIGNATURE (${farm.label})`);
    }
    let batch = 0;
    let peer = "";
    sets.forEach((other, j) => {
      if (i === j) return;
      const sim = overlap(own, other);
      if (sim > batch) {
        batch = sim;
        peer = (seats[j]?.id ?? "").slice(0, 8);
      }
    });
    if (batch >= 0.25) {
      flags.push(`CROSS_SEAT_BATCH_CLONE (shingle overlap ${(batch * 100).toFixed(1)}% with ${peer})`);
    }
    return { ...seat, flags };
  });
}
