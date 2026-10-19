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
      {!pulse ? (
        <div className="h-28 animate-pulse rounded-xl bg-card" />
      ) : pulse.ok ? (
        <Card>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-muted">{pulse.network || "Network"}</p>
            <p className="font-mono text-xs text-subtle">
              {pulse.chainId ? `${pulse.chainId} · ` : ""}
              {formatWhen(pulse.asOf)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Agents joined" value={formatCount(pulse.agentsJoined)} />
            <Stat label="Epochs closed" value={formatCount(pulse.epochsClosed)} />
            <Stat label="Holders" value={formatCount(pulse.holders)} />
            <Stat label="Transactions" value={formatCount(pulse.txs)} />
          </div>
          <p className="mt-4 border-t border-border pt-3 font-mono text-sm text-subtle">
            {formatPoints(pulse.supply)} research points
            {pulse.checkpoint != null ? ` · checkpoint ${formatCount(pulse.checkpoint)}` : ""}
            {pulse.finalTxs != null ? ` · ${formatCount(pulse.finalTxs)} final` : ""}
          </p>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-danger">{pulse.error ?? "The network did not answer."}</p>
        </Card>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <RecentEpochs history={history} />
        <div className="space-y-4">
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
          <Card>
            <h3 className="text-sm font-medium">Ballots</h3>
            {notes == null ? (
              <div className="mt-3 h-16 animate-pulse rounded-sm bg-background" />
            ) : notes.ballots.length === 0 ? (
              <p className="mt-2 text-sm text-muted">{notes.ballotNote || notes.error || "No open ballot."}</p>
            ) : (
              <ul className="mt-3 space-y-4">
                {notes.ballots.map((ballot) => (
                  <li key={ballot.id}>
                    <p className="text-sm font-medium">{ballot.title}</p>
                    <p className="break-all font-mono text-xs text-subtle">
                      {ballot.phase ? `${ballot.phase} · ` : ""}
                      {ballot.id}
                    </p>
                    <ul className="mt-2 space-y-2">
                      {ballot.topics.map((topic) => (
                        <li key={topic.id}>
                          <p className="text-sm text-muted">{topic.prompt}</p>
                          <p className="mt-1 break-words text-sm">
                            {topic.options
                              .map((opt) =>
                                topic.votes[opt] != null ? `${opt} ${topic.votes[opt]}` : opt,
                              )
                              .join(" · ")}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="text-sm font-medium">
            {history?.lastEpoch != null ? `Epoch ${history.lastEpoch}` : "Epoch history"}
          </h3>
          <p className="mt-1 text-sm text-muted">Bar height is attestations. The light bar is the latest close.</p>
          {history == null ? (
            <div className="mt-3 h-32 animate-pulse rounded-sm bg-background" />
          ) : history.ok && history.recent.length > 0 && chartOn ? (
            <div className="mt-3 h-32">
              <EpochChart rows={history.recent} />
            </div>
          ) : (
            <p className="mt-3 text-sm text-danger">{history.error ?? "No closed epochs in this snapshot."}</p>
          )}
          {history?.ok ? (
            <dl className="mt-4 grid grid-cols-4 gap-3 text-sm">
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

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
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
                <p className="mt-2 text-sm text-muted">Nothing from this operator yet.</p>
              )}
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function RecentEpochs({ history }: { history: HistorySnapshot | null }) {
  const rows = history?.ok ? [...history.recent].reverse().slice(0, 8) : [];
  return (
    <Card>
      <h3 className="text-sm font-medium">Recent epochs</h3>
      <p className="mt-1 text-sm text-muted">Newest first. Counts are what the ledger recorded.</p>
      {history == null ? (
        <div className="mt-3 h-32 animate-pulse rounded-sm bg-background" />
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-danger">{history.error ?? "No closed epochs in this snapshot."}</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-subtle">
                <th className="pb-2 pr-3 font-medium">Epoch</th>
                <th className="pb-2 pr-3 font-medium">Answers</th>
                <th className="pb-2 pr-3 font-medium">Attest</th>
                <th className="pb-2 pr-3 font-medium">Graders</th>
                <th className="pb-2 font-medium">Slashed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.epoch} className="border-t border-border font-mono tabular-nums">
                  <td className="py-2 pr-3">{row.epoch}</td>
                  <td className="py-2 pr-3">{formatCount(row.answers)}</td>
                  <td className="py-2 pr-3">{formatCount(row.attestations)}</td>
                  <td className="py-2 pr-3">{formatCount(row.graders)}</td>
                  <td className="py-2">{formatCount(row.slashed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
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
