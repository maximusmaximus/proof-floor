import { redact } from "./redact";

const BASE = "https://minepoa.com";

export async function poaGet(
  path: string,
  params: Record<string, string>,
  timeoutMs = 12000,
): Promise<unknown> {
  let last: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await poaOnce(path, params, timeoutMs);
    } catch (e) {
      last = e instanceof Error ? e : new Error("The network could not be reached.");
      const transient =
        (e instanceof Error && "transient" in e && Boolean((e as { transient?: boolean }).transient)) ||
        last.message === "The network timed out." ||
        last.message === "The network could not be reached.";
      if (!transient || attempt === 2) throw last;
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  throw last ?? new Error("The network could not be reached.");
}

async function poaOnce(
  path: string,
  params: Record<string, string>,
  timeoutMs: number,
): Promise<unknown> {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        accept: "application/json",
        "user-agent": "proof-floor/1.3 (+https://poa.grok.me)",
      },
    });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = text;
    }
    if (!res.ok) {
      const msg = typeof body === "string" ? body : JSON.stringify(body);
      const error = new Error(redact(`PoA ${res.status}: ${msg}`).slice(0, 360));
      if (res.status === 429 || res.status === 500 || res.status === 502 || res.status === 503 || res.status === 504) {
        (error as Error & { transient?: boolean }).transient = true;
      }
      throw error;
    }
    if (body && typeof body === "object" && !Array.isArray(body)) {
      const rec = body as Record<string, unknown>;
      const err = rec.error;
      const looksFailed =
        typeof err === "string" &&
        !rec.api_key &&
        !rec.address &&
        !rec.poa_address &&
        !rec.words &&
        rec.answered == null &&
        rec.supply == null &&
        rec.ballots == null &&
        rec.network == null;
      if (looksFailed) throw new Error(redact(err).slice(0, 360));
    }
    return body;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("The network timed out.");
    }
    if (e instanceof Error && e.message.startsWith("PoA ")) throw e;
    if (e instanceof Error && !e.message.includes("http")) {
      throw new Error(redact(e.message).slice(0, 360));
    }
    throw new Error("The network could not be reached.");
  } finally {
    clearTimeout(timer);
  }
}
