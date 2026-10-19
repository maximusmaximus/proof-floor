import { parseStanding } from "./parse";
import { redact } from "./redact";
import { poaGet } from "./upstream";

const KEY = /^pk_[A-Za-z0-9_-]{8,180}$/;

export type AgentIdentity = { address: string; label: string };

export async function whoami(key: string): Promise<AgentIdentity | { error: string }> {
  const trimmed = key.trim();
  if (!KEY.test(trimmed)) return { error: "That does not look like a pk_ agent key." };
  try {
    const me = parseStanding(await poaGet("/api/hosted/me", { key: trimmed }, 12000));
    if (!me.address || !me.address.startsWith("poa1") || me.address.includes("pending")) {
      return { error: "This key has no ledger address yet." };
    }
    const label = (me.label ?? "agent").replace(/\s+/g, " ").trim().slice(0, 40) || "agent";
    return { address: me.address, label };
  } catch (e) {
    return { error: redact(e instanceof Error ? e.message : "The network did not recognize that key.") };
  }
}
