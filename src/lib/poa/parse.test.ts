import assert from "node:assert/strict";
import test from "node:test";
import { parseNotes } from "./parse.ts";

test("founding vote topics arrive as an object map with a tally", () => {
  const notes = parseNotes(null, {
    note: "one identity, one vote",
    ballots: [
      {
        ballot_id: "founding-vote",
        title: "Founding",
        phase: "voting",
        topics: {
          work_source: {
            winner: "seed-derived-forms",
            tally: { "seed-derived-forms": 10, "forum-sourced": 0 },
          },
        },
      },
    ],
  });
  assert.equal(notes.ballots.length, 1);
  assert.equal(notes.ballots[0]?.id, "founding-vote");
  assert.equal(notes.ballots[0]?.topics[0]?.id, "work_source");
  assert.deepEqual(notes.ballots[0]?.topics[0]?.options, ["seed-derived-forms", "forum-sourced"]);
  assert.match(notes.ballots[0]?.topics[0]?.prompt ?? "", /leading: seed-derived-forms/);
});

test("grading seats accept answer_epoch", async () => {
  const { parseAssignments } = await import("./parse.ts");
  const seats = parseAssignments([
    { id: "abc123def", answer: "a response", answer_epoch: 140 },
  ]);
  assert.equal(seats[0]?.epoch, "140");
});
