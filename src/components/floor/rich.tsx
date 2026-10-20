import { useEffect, useState } from "react";
import { formatCount, formatPoints } from "@/lib/poa/format";
import { loadRichFn } from "@/lib/poa/fns";
import type { RichList } from "@/lib/poa/types";
import { Card } from "./bits";
import { CopyAddr } from "./copy-addr";

export function RichBoard() {
  const [list, setList] = useState<RichList | null>(null);

  useEffect(() => {
    let dead = false;
    const pull = () => {
      if (document.visibilityState === "hidden") return;
      void loadRichFn()
        .then((next) => {
          if (!dead) setList(next);
        })
        .catch(() => {
          if (!dead) setList({ ok: false, error: "The richlist did not load.", holders: 0, rows: [] });
        });
    };
    pull();
    const timer = window.setInterval(pull, 60000);
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
        <h3 className="text-sm font-medium">Richlist</h3>
        <p className="font-mono text-xs text-subtle">
          {list?.ok ? `${formatCount(list.holders)} with a balance` : "Reading"}
        </p>
      </div>
      <p className="mt-1 text-sm text-muted">Largest balances first. Tap an address to copy it.</p>
      {list == null ? (
        <div className="mt-3 h-40 animate-pulse rounded-sm bg-background" />
      ) : !list.ok ? (
        <p className="mt-3 text-sm text-danger">{list.error ?? "The richlist did not load."}</p>
      ) : list.rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No address has a balance yet.</p>
      ) : (
        <ol className="mt-3 max-h-[28rem] overflow-y-auto">
          {list.rows.map((row) => (
            <li key={row.address} className="flex items-center gap-3 border-b border-border last:border-b-0">
              <span className="w-8 shrink-0 font-mono text-xs text-subtle">{row.rank}</span>
              <CopyAddr address={row.address} className="min-w-0 flex-1" />
              <span className="shrink-0 font-mono text-sm tabular-nums text-foreground">{formatPoints(row.amount)}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
