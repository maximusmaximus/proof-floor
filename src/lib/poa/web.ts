export type WebNode = {
  id: string;
  short: string;
  x: number;
  y: number;
  links: number;
};

export type WebLink = {
  key: string;
  from: string;
  to: string;
  label: string;
  n: number;
};

export type WebTx = {
  id: string;
  from: string;
  to: string;
  fromShort: string;
  going: string;
  label: string;
};

function shortOf(id: string, fallback: string): string {
  if (fallback && fallback.length <= 18) return fallback;
  if (id.startsWith("poa1") && id.length > 16) return `${id.slice(0, 8)}…${id.slice(-4)}`;
  return fallback || id;
}

export function buildWeb(txs: WebTx[]): { nodes: WebNode[]; links: WebLink[] } {
  const degree = new Map<string, number>();
  const names = new Map<string, string>();
  const links = new Map<string, WebLink>();

  for (const tx of txs) {
    const from = tx.from || tx.fromShort;
    const to = tx.to || tx.going;
    if (!from || !to || from === to) continue;
    names.set(from, shortOf(from, tx.fromShort || from));
    names.set(to, shortOf(to, tx.to ? tx.going : to));
    degree.set(from, (degree.get(from) ?? 0) + 1);
    degree.set(to, (degree.get(to) ?? 0) + 1);
    const key = from < to ? `${from}|${to}` : `${to}|${from}`;
    const prev = links.get(key);
    if (prev) prev.n += 1;
    else links.set(key, { key, from, to, label: tx.label, n: 1 });
  }

  const ids = [...degree.keys()].sort(
    (a, b) => (degree.get(b) ?? 0) - (degree.get(a) ?? 0) || a.localeCompare(b),
  );
  const kept = ids.slice(0, 28);
  const hub = kept.length > 4;
  const nodes: WebNode[] = kept.map((id, index) => {
    if (hub && index === 0) {
      return { id, short: names.get(id) ?? id, x: 500, y: 460, links: degree.get(id) ?? 0 };
    }
    const count = hub ? kept.length - 1 : kept.length;
    const slot = hub ? index - 1 : index;
    const angle = (slot / Math.max(count, 1)) * Math.PI * 2 - Math.PI / 2;
    return {
      id,
      short: names.get(id) ?? id,
      x: 500 + Math.cos(angle) * 340,
      y: 460 + Math.sin(angle) * 300,
      links: degree.get(id) ?? 0,
    };
  });
  const have = new Set(nodes.map((node) => node.id));
  return {
    nodes,
    links: [...links.values()].filter((link) => have.has(link.from) && have.has(link.to)),
  };
}
