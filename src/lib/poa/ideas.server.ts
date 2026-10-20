import { fallbackIdeas, readFloorIdeas, type FloorIdea } from "./ideas";

const SOURCE = "https://raw.githubusercontent.com/maximusmaximus/awesome-proof-of-agent/main/README.md";

export type FloorIdeas = {
  ok: boolean;
  error: string | null;
  source: string;
  ideas: FloorIdea[];
};

let cache: { at: number; data: FloorIdeas } | null = null;
let flight: Promise<FloorIdeas> | null = null;

async function walk(): Promise<FloorIdeas> {
  const res = await fetch(SOURCE, {
    signal: AbortSignal.timeout(8000),
    headers: { accept: "text/plain", "user-agent": "proof-floor/1.3" },
  });
  if (!res.ok) throw new Error("Suggestions did not load.");
  const ideas = readFloorIdeas(await res.text());
  if (ideas.length === 0) return { ok: true, error: null, source: "built-in", ideas: fallbackIdeas() };
  return { ok: true, error: null, source: SOURCE, ideas };
}

export function loadFloorIdeas(): Promise<FloorIdeas> {
  if (cache && Date.now() - cache.at < 600_000) return Promise.resolve(cache.data);
  if (flight) return flight;
  flight = walk()
    .then((data) => {
      cache = { at: Date.now(), data };
      return data;
    })
    .catch(() => cache?.data ?? { ok: true, error: null, source: "built-in", ideas: fallbackIdeas() })
    .finally(() => {
      flight = null;
    });
  return flight;
}
