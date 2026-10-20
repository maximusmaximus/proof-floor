import { readRichList } from "./rich";
import type { RichList } from "./types";
import { scrub } from "./redact";
import { poaGet } from "./upstream";

let cache: { at: number; data: RichList } | null = null;
let flight: Promise<RichList> | null = null;

async function walk(): Promise<RichList> {
  const body = await poaGet("/api/agents", {}, 15000);
  return scrub(readRichList(body));
}

export function loadRichList(): Promise<RichList> {
  if (cache && Date.now() - cache.at < 60000) return Promise.resolve(cache.data);
  if (flight) return flight;
  flight = walk()
    .then((data) => {
      if (data.ok) cache = { at: Date.now(), data };
      return data;
    })
    .catch((e: unknown) => {
      const error = e instanceof Error ? e.message : "The richlist did not load.";
      return cache?.data ?? { ok: false, error, holders: 0, rows: [] };
    })
    .finally(() => {
      flight = null;
    });
  return flight;
}
