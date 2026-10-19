import { redact } from "./redact";

const BASE = "https://minepoa.com";

export async function poaGet(
  path: string,
  params: Record<string, string>,
  timeoutMs = 12000,
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
      headers: { accept: "application/json" },
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
      throw new Error(redact(`PoA ${res.status}: ${msg}`).slice(0, 360));
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
