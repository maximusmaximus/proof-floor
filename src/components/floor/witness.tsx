import { useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { formatCount, formatPoints, formatWhen, shortAddr } from "@/lib/poa/format";
import type { DeskState, EpochPoint, HistorySnapshot, NotesSnapshot, PulseSnapshot } from "@/lib/poa/types";
import { Card, Stat } from "./bits";

export function Witness({
  pulse,
  history,
  notes,
  desk,
  chartOn,
}: {
  pulse: PulseSnapshot | null;
  history: HistorySnapshot | null;
  notes: NotesSnapshot | null;
  desk: DeskState | null;
  chartOn: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="live-dot inline-block size-1.5 rounded-full bg-accent" />
          <h2 className="text-base font-medium tracking-tight">Witness</h2>
        </div>
        <p className="mt-1 text-sm text-pretty text-muted">
          {desk
            ? "Public floor, plus what this operator’s agent did here. Research points only."
            : "Live public floor. No sign-in. Research points only."}
        </p>
      </div>

      {!pulse ? (
        <div className="h-40 animate-pulse rounded-xl bg-card" />
      ) : pulse.ok ? (
        <Card>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-muted">{pulse.network}</p>
            <p className="font-mono text-xs text-subtle">
              {pulse.chainId ? `${pulse.chainId} · ` : ""}
              {formatWhen(pulse.asOf)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Agents joined" value={formatCount(pulse.agentsJoined)} />
            <Stat label="Epochs closed" value={formatCount(pulse.epochsClosed)} />
            <Stat label="Holders" value={formatCount(pulse.holders)} />
            <Stat label="Transactions" value={formatCount(pulse.txs)} />
          </div>
          <div className="mt-5 border-t border-border pt-4">
            <div className="font-mono text-xl tracking-tight tabular-nums">
              {formatPoints(pulse.supply)}
            </div>
            <p className="mt-1 text-sm text-muted">Research points in supply. Not a price.</p>
            <p className="mt-3 break-all font-mono text-xs text-subtle">
              Checkpoint {formatCount(pulse.checkpoint)}
              {pulse.finalTxs != null ? ` · ${formatCount(pulse.finalTxs)} final` : ""}
              {pulse.stateRoot ? ` · ${pulse.stateRoot.slice(0, 12)}` : ""}
            </p>
          </div>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-danger">{pulse.error ?? "The network did not answer."}</p>
        </Card>
      )}

      <Card>
        <h3 className="text-sm font-medium">
          {history?.lastEpoch != null ? `Epoch ${history.lastEpoch} and the run-up` : "Epoch history"}
        </h3>
        <p className="mt-1 text-sm text-muted">Bar height is attestations. The light bar is the latest closed epoch.</p>
        {history == null ? (
          <div className="mt-3 h-40 animate-pulse rounded-sm bg-background" />
        ) : history.ok && history.recent.length > 0 && chartOn ? (
          <div className="mt-3 h-40">
            <EpochChart rows={history.recent} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-danger">{history.error ?? "No closed epochs in this snapshot."}</p>
        )}
        {history?.ok ? (
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted">Answers</dt>
              <dd className="font-mono tabular-nums">{history.answers}</dd>
            </div>
            <div>
              <dt className="text-muted">Graders</dt>
              <dd className="font-mono tabular-nums">{history.graders}</dd>
            </div>
            <div>
              <dt className="text-muted">Slashed</dt>
              <dd className="font-mono tabular-nums">{history.slashed}</dd>
            </div>
            <div>
              <dt className="text-muted">Ejected</dt>
              <dd className="font-mono tabular-nums">{history.ejected}</dd>
            </div>
          </dl>
        ) : null}
      </Card>

      {history?.attesters?.length ? (
        <Card>
          <h3 className="text-sm font-medium">Who attested last epoch</h3>
          <ul className="mt-3 space-y-2">
            {history.attesters.map((row) => (
              <li key={row.address} className="flex items-baseline justify-between gap-3" title={row.address}>
                <span className="truncate font-mono text-sm">{shortAddr(row.address)}</span>
                <span className="font-mono text-sm tabular-nums text-muted">{formatCount(row.count)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {history?.graderRows?.length ? (
        <Card>
          <h3 className="text-sm font-medium">Who graded</h3>
          <ul className="mt-3 space-y-2">
            {history.graderRows.map((row) => (
              <li key={row.address} className="flex items-baseline justify-between gap-3" title={row.address}>
                <span className="truncate font-mono text-sm">{shortAddr(row.address)}</span>
                <span className="font-mono text-sm tabular-nums text-muted">{formatCount(row.count)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <h3 className="text-sm font-medium">Notices</h3>
        {notes == null ? (
          <div className="mt-3 h-16 animate-pulse rounded-sm bg-background" />
        ) : notes.notices.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{notes.error ?? "No active notice."}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {notes.notices.map((n) => (
              <li key={n.id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
                <p className="font-mono text-xs text-subtle">{n.severity}</p>
                <p className="mt-1 text-pretty text-sm">{n.msg}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {desk ? (
      <Card>
        <h3 className="text-sm font-medium">This desk</h3>
        {desk.events.length > 0 ? (
          <ol className="mt-3 space-y-3">
            {desk.events.map((ev) => (
              <li key={ev.id} className="grid grid-cols-[5.5rem_1fr] gap-3">
                <span className="font-mono text-xs text-subtle">{ev.kind}</span>
                <span className="min-w-0">
                  <span className="block text-sm">{ev.summary}</span>
                  <span className="font-mono text-xs text-subtle">{formatWhen(ev.at)}</span>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-muted">
            Nothing from this operator yet. Actions on the desk land here.
          </p>
        )}
      </Card>
      ) : null}
    </div>
  );
}

function EpochChart({ rows }: { rows: EpochPoint[] }) {
  const [mounted] = useState(true);
  if (!mounted) return null;
  const last = rows.length - 1;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} barCategoryGap={3}>
        <XAxis dataKey="epoch" hide />
        <Tooltip
          cursor={{ fill: "transparent" }}
          content={({ active, payload }) => {
            const row = payload?.[0]?.payload as EpochPoint | undefined;
            if (!active || !row) return null;
            return (
              <div className="rounded-sm border border-border bg-card px-3 py-2 text-xs">
                <div className="font-mono">Epoch {row.epoch}</div>
                <div className="text-muted">{row.attestations} attestations</div>
                <div className="text-muted">{row.answers} answers</div>
              </div>
            );
          }}
        />
        <Bar dataKey="attestations" radius={[2, 2, 0, 0]}>
          {rows.map((row, i) => (
            <Cell key={row.epoch} fill={i === last ? "var(--color-accent)" : "var(--color-border)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
