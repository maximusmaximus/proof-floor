import assert from "node:assert/strict";
import test from "node:test";
import { fallbackIdeas, pickSlides, readFloorIdeas } from "./ideas.ts";
import { IDLE_MS, stepTheater } from "./theater.ts";

const sample = `
### 4. Grading-quality tools
| Idea | Description |
| Rubric checker | Scores a draft |
### 5. Dashboards and explorer views
| Idea | Description | Difficulty |
| Personal status card | Needs a key | green |
| Network health board | Charts of status over time | yellow |
| Notice verifier | Checks notice txids | yellow |
| Epoch-length tracker | Observed epoch boundaries | green |
| Ballot tally replayer | Recomputes tallies | red |
### 6. Forum and governance digests
| Idea | Description |
| Weekly digest | Mail |
`;

test("only public dashboard suggestions become charts", () => {
  const ideas = readFloorIdeas(sample);
  assert.deepEqual(
    ideas.map((idea) => idea.id),
    ["health", "epochs", "ballot"],
  );
  assert.equal(ideas[0]?.title, "Network health board");
});

test("a ballot chart is skipped when no ballot is open", () => {
  const ideas = fallbackIdeas();
  assert.deepEqual(pickSlides(ideas, false), ["health", "epochs"]);
  assert.deepEqual(pickSlides(ideas, true), ["health", "epochs", "ballot"]);
});

test("stillness for two minutes opens the charts, then rotates", () => {
  const start = stepTheater({ lastActive: 0, open: false, index: 0, slideAt: 0 }, 1_000, false, 3);
  assert.equal(start.open, false);
  const opened = stepTheater(start, IDLE_MS, false, 3);
  assert.equal(opened.open, true);
  assert.equal(opened.index, 0);
  const next = stepTheater(opened, IDLE_MS + IDLE_MS, false, 3);
  assert.equal(next.index, 1);
  const back = stepTheater(next, IDLE_MS + IDLE_MS + 10, true, 3);
  assert.equal(back.open, false);
});
