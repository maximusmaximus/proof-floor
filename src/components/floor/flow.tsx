import { useEffect, useState } from "react";
import { formatPoints } from "@/lib/poa/format";
import { loadFlowFn } from "@/lib/poa/fns";
import type { FlowSnapshot, FlowTx } from "@/lib/poa/types";
import { Card } from "./bits";

function rel(iso: string, now: number): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export function FlowBoard() {
  const [flow, setFlow] = useState<FlowSnapshot | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(clock);
  }, []);

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

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium">Where transactions are going</h3>
        <p className="font-mono text-xs text-subtle">{flow?.ok ? `${flow.txs.length} latest` : "Reading"}</p>
      </div>
      <p className="mt-1 text-sm text-muted">From the agent, to an epoch, a grading seat, an address, or the transactions it signs.</p>
      {flow == null ? (
        <div className="mt-3 h-40 animate-pulse rounded-sm bg-background" />
      ) : !flow.ok ? (
        <p className="mt-3 text-sm text-danger">{flow.error ?? "Transactions did not load."}</p>
      ) : flow.txs.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No transactions in this page.</p>
      ) : (
        <ul className="mt-3 max-h-[28rem] overflow-y-auto">
          {flow.txs.map((tx) => (
            <FlowRow key={tx.id} tx={tx} now={now} open={openId === tx.id} onToggle={() => setOpenId(openId === tx.id ? null : tx.id)} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function FlowRow({
  tx,
  now,
  open,
  onToggle,
}: {
  tx: FlowTx;
  now: number;
  open: boolean;
  onToggle: () => void;
}) {
  const expandable = tx.targets.length > 0;
  return (
    <li className="border-b border-border py-3 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-xs text-subtle">
          {tx.label}
          {tx.final ? "" : " · open"}
        </span>
        <span className="font-mono text-xs text-subtle">{rel(tx.at, now)}</span>
      </div>
      <p className="mt-1 break-words font-mono text-sm text-foreground">
        <span title={tx.from || undefined}>{tx.fromShort}</span>
        <span className="text-muted"> → </span>
        <span title={tx.to || undefined}>{tx.going}</span>
        {tx.amount ? <span className="text-muted"> · {formatPoints(tx.amount)}</span> : null}
      </p>
      {expandable ? (
        <button type="button" className="mt-1 min-h-11 font-mono text-xs text-subtle" onClick={onToggle}>
          {open ? "Hide" : "Where"}
        </button>
      ) : null}
      {open && expandable ? (
        <ul className="mt-1 space-y-1">
          {tx.targets.map((target) => (
            <li key={target.id} className="break-all font-mono text-xs text-muted" title={target.id}>
              {target.id}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
