export type FloorIdea = {
  id: "health" | "epochs" | "ballot";
  title: string;
  detail: string;
};

const FALLBACK_MD = `
### 5. Dashboards and explorer views
| Idea | Description | Difficulty |
|---|---|---|
| Personal status card | Balance, vesting, established flag | green |
| Network health board | Charts of status over time: agents, epochs, finality, checkpoints | yellow |
| Notice verifier | Lists active notices and checks each txid | yellow |
| Epoch-length tracker | Records observed epoch boundaries so schedulers can adapt | green |
| Ballot tally replayer | Independently recomputes ballot tallies from public ledger data | red |
`;

function fitId(title: string): FloorIdea["id"] | null {
  const t = title.toLowerCase();
  if (t.includes("network health")) return "health";
  if (t.includes("epoch")) return "epochs";
  if (t.includes("ballot") || t.includes("tally")) return "ballot";
  return null;
}

export function readFloorIdeas(markdown: string): FloorIdea[] {
  const section = markdown.split(/###\s+5\.\s+Dashboards and explorer views/i)[1] ?? "";
  const block = section.split(/###\s+/)[0] ?? "";
  const ideas: FloorIdea[] = [];
  const seen = new Set<string>();
  for (const line of block.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line
      .split("|")
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0);
    if (cells.length < 2) continue;
    if (/^idea$/i.test(cells[0]) || /^-+$/.test(cells[0].replace(/:/g, ""))) continue;
    const title = cells[0].replace(/[*_`]/g, "");
    const id = fitId(title);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ideas.push({ id, title, detail: cells[1].replace(/[*_`]/g, "") });
  }
  return ideas;
}

export function fallbackIdeas(): FloorIdea[] {
  return readFloorIdeas(FALLBACK_MD);
}

export function pickSlides(ideas: { id: string }[], hasBallot: boolean): FloorIdea["id"][] {
  const ids = ideas
    .map((idea) => idea.id)
    .filter((id): id is FloorIdea["id"] => id === "health" || id === "epochs" || (id === "ballot" && hasBallot));
  return ids.length > 0 ? ids : hasBallot ? ["health", "epochs", "ballot"] : ["health", "epochs"];
}
