import assert from "node:assert/strict";
import test from "node:test";
import { auditSeats } from "./audit.ts";
import type { AssignmentView } from "./types.ts";

function seat(id: string, text: string, words: string[] = []): AssignmentView {
  return { id, text, epoch: "1", words, priors: [], flags: [] };
}

const essay =
  "A vesting schedule makes a fresh identity expensive because the reward stays locked until later epochs prove the same account kept working instead of rotating away.";

test("known farm signatures and cross-seat clones are flagged", () => {
  const farm = `${essay} - ref abcdef`;
  const [first, second, third] = auditSeats([
    seat("aaaaaaaa", farm),
    seat("bbbbbbbb", farm),
    seat("cccccccc", "Honeypot answers expose rubber-stamp graders. A planted junk submission should be scored zero, and approving it costs the grader their own locked reward."),
  ]);
  assert.match(first?.flags.join(" ") ?? "", /KNOWN_BOT_FARM_SIGNATURE/);
  assert.match(first?.flags.join(" ") ?? "", /CROSS_SEAT_BATCH_CLONE/);
  assert.match(second?.flags.join(" ") ?? "", /CROSS_SEAT_BATCH_CLONE/);
  assert.equal((third?.flags ?? []).some((flag) => flag.startsWith("CROSS_SEAT")), false);
});

test("an inflected seed word is not counted as present", () => {
  const [row] = auditSeats([
    seat("dddddddd", `${essay} The gardens stay expensive to fake.`, ["vesting", "garden"]),
  ]);
  const flags = row?.flags.join(" ") ?? "";
  assert.match(flags, /INFLECTED_SEED_WORDS \(garden\)/);
  assert.equal(flags.includes("MISSING_SEED_WORDS"), false);
});
