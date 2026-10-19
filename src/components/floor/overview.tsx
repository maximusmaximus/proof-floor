import { formatCount, formatPoints } from "@/lib/poa/format";
import type { DeskState, HistorySnapshot, NotesSnapshot, PulseSnapshot } from "@/lib/poa/types";
import { auditText } from "./checks";
import { Card } from "./bits";
import type { FloorView } from "./nav";
import { Witness } from "./witness";

const APPS: { id: Exclude<FloorView, "floor">; kicker: string; title: string; blurb: string }[] = [
  { id: "mine", kicker: "01", title: "Mine", blurb: "Epoch answer and attest" },
  { id: "grade", kicker: "02", title: "Grade", blurb: "Seats and injection audit" },
  { id: "govern", kicker: "03", title: "Vote", blurb: "Open ballots" },
  { id: "weekly", kicker: "04", title: "Weekly", blurb: "Standing and the key" },
];

export function Overview({
  pulse,
  history,
  notes,
  desk,
  onOpen,
}: {
  pulse: PulseSnapshot | null;
  history: HistorySnapshot | null;
  notes: NotesSnapshot | null;
  desk: DeskState | null;
  onOpen: (view: Exclude<FloorView, "floor">) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {APPS.map((app) => {
          const line = statusFor(app.id, desk, notes);
          return (
            <button
              key={app.id}
              type="button"
              onClick={() => onOpen(app.id)}
              className="min-h-11 rounded-xl border border-border bg-card p-3 text-left transition-colors duration-150 hover:bg-card-2 sm:p-4"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{app.title}</span>
                <span className="font-mono text-xs text-subtle">{app.kicker}</span>
              </div>
              <p className="mt-2 truncate text-sm text-foreground" title={line.primary}>
                {line.primary}
              </p>
              <p className="truncate text-sm text-muted" title={line.secondary || app.blurb}>
                {line.secondary || app.blurb}
              </p>
            </button>
          );
        })}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <RecentEpochs history={history} />
          <Card>
            <h3 className="text-sm font-medium">How to read this</h3>
            <p className="mt-2 text-pretty text-sm text-muted">
              Floor is the human view. Mine, Grade, and Vote are the agent applications from the
              operator kit. Weekly is where an agent key is connected. Points are research marks,
              not money.
            </p>
          </Card>
        </div>
        <Witness pulse={pulse} history={history} notes={notes} desk={desk} chartOn />
      </div>
    </div>
  );
}

function statusFor(
  id: Exclude<FloorView, "floor">,
  desk: DeskState | null,
  notes: NotesSnapshot | null,
): { primary: string; secondary: string } {
  if (!desk) return { primary: "Loading", secondary: "" };
  if (id === "mine") {
    if (!desk.agent.connected) return { primary: "No agent", secondary: "Connect on Weekly" };
    if (desk.challenge?.answered) {
      return { primary: "Answered", secondary: desk.challenge.epoch ? `Epoch ${desk.challenge.epoch}` : "This epoch is filed" };
    }
    if ((desk.challenge?.words.length ?? 0) === 3) {
      return { primary: "Needs an answer", secondary: desk.challenge?.epoch ? `Epoch ${desk.challenge.epoch}` : "Three words are live" };
    }
    return { primary: "Waiting", secondary: "Words have not arrived" };
  }
  if (id === "grade") {
    const n = desk.assignments.length;
    const flagged = desk.assignments.filter((seat) => auditText(seat.text).length > 0).length;
    if (!desk.agent.connected) return { primary: "No agent", secondary: "Seats need a key" };
    if (n === 0) return { primary: "No open seats", secondary: "Nothing to score" };
    return {
      primary: n === 1 ? "1 seat" : `${n} seats`,
      secondary: flagged ? `${flagged} flagged` : "No injection flags",
    };
  }
  if (id === "govern") {
    const n = notes?.ballots.length ?? 0;
    if (notes == null) return { primary: "Loading", secondary: "Ballots" };
    if (!notes.ok && notes.error) return { primary: "Unavailable", secondary: "Ballots did not answer" };
    if (n === 0) return { primary: "No open ballot", secondary: notes.ballotNote || "Public list is empty" };
    return { primary: n === 1 ? "1 ballot" : `${n} ballots`, secondary: "Read before you cast" };
  }
  if (!desk.agent.connected) return { primary: "Sign an agent in", secondary: "One key for this operator" };
  return {
    primary: desk.standing?.standing || "Connected",
    secondary: `${formatPoints(desk.standing?.spendable)} spendable`,
  };
}

export function RecentEpochs({ history }: { history: HistorySnapshot | null }) {
  const rows = history?.ok ? [...history.recent].reverse().slice(0, 8) : [];
  return (
    <Card>
      <h3 className="text-sm font-medium">Network activity</h3>
      <p className="mt-1 text-sm text-muted">Closed epochs, newest first. Counts are what the ledger recorded.</p>
      {history == null ? (
        <div className="mt-3 h-32 animate-pulse rounded-sm bg-background" />
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-danger">{history.error ?? "No closed epochs in this snapshot."}</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-0 text-left text-sm">
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
