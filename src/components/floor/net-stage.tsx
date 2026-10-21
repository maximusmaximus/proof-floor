import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCount, formatPoints } from "@/lib/poa/format";
import { loadFlowFn, loadRichFn } from "@/lib/poa/fns";
import type { FlowSnapshot, HistorySnapshot, RichList } from "@/lib/poa/types";
import { buildWeb } from "@/lib/poa/web";
import { Card } from "./bits";
import { CopyAddr } from "./copy-addr";

type Pane = "web" | "epochs" | "holders";

export function NetStage({ history, tall }: { history: HistorySnapshot | null; tall?: boolean }) {
  const [pane, setPane] = useState<Pane>("web");
  const [flow, setFlow] = useState<FlowSnapshot | null>(null);
  const [rich, setRich] = useState<RichList | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    const pull = () => {
      if (document.visibilityState === "hidden") return;
      void loadFlowFn()
        .then((next) => {
          if (!dead) setFlow(next);
        })
        .catch(() => {
          if (!dead) setFlow({ ok: false, error: "Transactions did not load.", txs: [] });
        });
      void loadRichFn()
        .then((next) => {
          if (!dead) setRich(next);
        })
        .catch(() => {
          if (!dead) setRich({ ok: false, error: "The richlist did not load.", holders: 0, rows: [] });
        });
    };
    pull();
    const timer = window.setInterval(pull, 20000);
    const onVisible = () => {
      if (document.visibilityState === "visible") pull();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      dead = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const web = useMemo(() => buildWeb(flow?.txs ?? []), [flow]);
  const selected = web.nodes.find((node) => node.id === picked) ?? null;

  return (
    <Card className={`flex flex-col p-0 ${tall ? "xl:h-[calc(100dvh-4.5rem)]" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
        <div className="flex gap-1" role="tablist" aria-label="Network graphs">
          {(
            [
              ["web", "Web"],
              ["epochs", "Epochs"],
              ["holders", "Holders"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={pane === id}
              className={`min-h-11 rounded-sm px-3 text-sm ${pane === id ? "bg-card-2 text-foreground" : "text-muted"}`}
              onClick={() => setPane(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="font-mono text-xs text-subtle">
          {pane === "web" ? `${web.nodes.length} points` : pane === "epochs" ? "Recent closes" : rich?.ok ? `${formatCount(rich.holders)} holders` : "Reading"}
        </p>
      </div>

      <div className="min-h-0 flex-1" role="tabpanel">
        {pane === "web" ? (
          <WebPane web={web} flow={flow} picked={picked} onPick={setPicked} selected={selected} />
        ) : null}
        {pane === "epochs" ? <EpochPane history={history} /> : null}
        {pane === "holders" ? <HolderPane rich={rich} /> : null}
      </div>
    </Card>
  );
}

function WebPane({
  web,
  flow,
  picked,
  onPick,
  selected,
}: {
  web: ReturnType<typeof buildWeb>;
  flow: FlowSnapshot | null;
  picked: string | null;
  onPick: (id: string | null) => void;
  selected: ReturnType<typeof buildWeb>["nodes"][number] | null;
}) {
  const byId = new Map(web.nodes.map((node) => [node.id, node]));
  if (flow == null) return <div className="m-4 h-64 animate-pulse rounded-sm bg-background" />;
  if (!flow.ok) return <p className="p-4 text-sm text-danger">{flow.error}</p>;
  if (web.nodes.length < 2) return <p className="p-4 text-sm text-muted">Not enough addresses in this page to draw a web.</p>;

  return (
    <div className="flex h-full min-h-80 flex-col">
      <svg viewBox="0 0 1000 920" className="min-h-0 w-full flex-1" role="img" aria-label="Transaction web">
        {web.links.map((link) => {
          const a = byId.get(link.from);
          const b = byId.get(link.to);
          if (!a || !b) return null;
          const hot = picked != null && (link.from === picked || link.to === picked);
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.hypot(dx, dy) || 1;
          const d = `M ${a.x} ${a.y} Q ${mx + (-dy / len) * 36} ${my + (dx / len) * 36} ${b.x} ${b.y}`;
          return (
            <path
              key={link.key}
              d={d}
              fill="none"
              stroke={hot ? "var(--color-accent)" : "var(--color-border)"}
              strokeWidth={hot ? 2.5 : 1 + Math.min(link.n, 4)}
            />
          );
        })}
        {web.nodes.map((node) => {
          const on = node.id === picked;
          const r = on ? 22 : 12 + Math.min(node.links, 6) * 2;
          return (
            <g key={node.id} transform={`translate(${node.x} ${node.y})`}>
              <circle
                r={r}
                fill={on ? "var(--color-accent)" : "var(--color-card-2)"}
                stroke="var(--color-accent)"
                strokeWidth={on ? 0 : 1.5}
                className="cursor-pointer"
                role="button"
                tabIndex={0}
                aria-label={node.short}
                onClick={() => onPick(on ? null : node.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onPick(on ? null : node.id);
                  }
                }}
              />
              {on ? (
                <text y={4} textAnchor="middle" fill="var(--color-accent-fg)" fontSize="12" fontFamily="IBM Plex Mono, monospace">
                  {node.links}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <div className="border-t border-border px-4 py-3">
        {selected ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {selected.id.startsWith("poa1") ? (
              <CopyAddr address={selected.id} />
            ) : (
              <span className="font-mono text-sm">{selected.short}</span>
            )}
            <span className="font-mono text-xs text-subtle">{selected.links} links in this page</span>
          </div>
        ) : (
          <p className="text-sm text-muted">Click a point. The busiest one sits in the middle.</p>
        )}
      </div>
    </div>
  );
}

function EpochPane({ history }: { history: HistorySnapshot | null }) {
  const rows = history?.ok ? history.recent : [];
  if (history == null) return <div className="m-4 h-64 animate-pulse rounded-sm bg-background" />;
  if (rows.length === 0) return <p className="p-4 text-sm text-danger">{history.error ?? "No closed epochs."}</p>;
  return (
    <div className="flex h-full min-h-72 flex-col p-3">
      <ul className="mb-2 flex flex-wrap gap-4 text-xs text-muted">
        <li className="flex items-center gap-2"><span className="inline-block size-2 bg-accent" /> Answers</li>
        <li className="flex items-center gap-2"><span className="inline-block size-2 bg-muted" /> Attestations</li>
        <li className="flex items-center gap-2"><span className="inline-block size-2 bg-ok" /> Graders</li>
      </ul>
      <div className="min-h-56 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows}>
            <CartesianGrid stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="epoch" stroke="var(--color-subtle)" tickLine={false} axisLine={false} />
            <YAxis stroke="var(--color-subtle)" tickLine={false} axisLine={false} width={32} />
            <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
            <Bar dataKey="answers" fill="var(--color-accent)" radius={[2, 2, 0, 0]} />
            <Bar dataKey="attestations" fill="var(--color-muted)" radius={[2, 2, 0, 0]} />
            <Bar dataKey="graders" fill="var(--color-ok)" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function HolderPane({ rich }: { rich: RichList | null }) {
  if (rich == null) return <div className="m-4 h-64 animate-pulse rounded-sm bg-background" />;
  if (!rich.ok || rich.rows.length === 0) return <p className="p-4 text-sm text-danger">{rich.error ?? "No holders in this page."}</p>;
  const top = Math.max(...rich.rows.map((row) => Number(row.amount) || 0), 1);
  return (
    <ul className="max-h-[32rem] space-y-3 overflow-y-auto p-4 xl:max-h-none">
      {rich.rows.map((row) => {
        const n = Number(row.amount) || 0;
        return (
          <li key={row.address}>
            <div className="flex items-center justify-between gap-3">
              <CopyAddr address={row.address} />
              <span className="font-mono text-xs text-subtle">{formatPoints(row.amount)}</span>
            </div>
            <div className="mt-1 h-2 rounded-sm bg-background">
              <div className="h-full rounded-sm bg-accent" style={{ width: `${Math.max(4, (n / top) * 100)}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
