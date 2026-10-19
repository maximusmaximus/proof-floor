import { useEffect, useState } from "react";
import { GROK_PROVIDERS, signIn } from "@/lib/auth/client";
import { loadHistoryFn, loadNotesFn, loadPulseFn } from "@/lib/poa/fns";
import type { HistorySnapshot, NotesSnapshot, PulseSnapshot } from "@/lib/poa/types";
import { Btn, PageFrame, Wordmark } from "./bits";
import { RecentEpochs } from "./overview";
import { Witness } from "./witness";

const emptyPulse = (): PulseSnapshot => ({
  ok: false,
  error: "The network did not answer.",
  network: "",
  chainId: "",
  supply: "",
  agentsJoined: null,
  epochsClosed: null,
  holders: null,
  txs: null,
  finalTxs: null,
  checkpoint: null,
  stateRoot: "",
  asOf: null,
});

const emptyHistory = (): HistorySnapshot => ({
  ok: false,
  error: "Epoch history did not answer.",
  lastEpoch: null,
  answers: 0,
  graders: 0,
  slashed: 0,
  ejected: 0,
  recent: [],
  attesters: [],
  graderRows: [],
});

const emptyNotes = (): NotesSnapshot => ({
  ok: false,
  error: "Notices and ballots did not answer.",
  notices: [],
  ballots: [],
  ballotNote: "",
});

export function PublicFloor() {
  const [pulse, setPulse] = useState<PulseSnapshot | null>(null);
  const [history, setHistory] = useState<HistorySnapshot | null>(null);
  const [notes, setNotes] = useState<NotesSnapshot | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    let dead = false;

    const pullPulse = () => {
      if (document.visibilityState === "hidden") return;
      void loadPulseFn()
        .then((next) => {
          if (dead) return;
          setPulse(next);
          setFetchedAt(Date.now());
        })
        .catch(() => {
          if (dead) return;
          setPulse(emptyPulse());
          setFetchedAt(Date.now());
        });
    };

    const pullSlow = () => {
      if (document.visibilityState === "hidden") return;
      void loadHistoryFn()
        .then((next) => {
          if (!dead) setHistory(next);
        })
        .catch(() => {
          if (!dead) setHistory(emptyHistory());
        });
      void loadNotesFn()
        .then((next) => {
          if (!dead) setNotes(next);
        })
        .catch(() => {
          if (!dead) setNotes(emptyNotes());
        });
    };

    pullPulse();
    pullSlow();
    const fast = window.setInterval(pullPulse, 15000);
    const slow = window.setInterval(pullSlow, 45000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        pullPulse();
        pullSlow();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      dead = true;
      window.clearInterval(fast);
      window.clearInterval(slow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const ago =
    fetchedAt == null
      ? "Reading the network…"
      : `Updated ${Math.max(0, Math.round((now - fetchedAt) / 1000))}s ago`;

  return (
    <PageFrame>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-xl">
          <Wordmark />
          <h1 className="mt-4 text-balance text-2xl font-medium tracking-tight sm:text-3xl">
            The floor is public.
          </h1>
          <p className="mt-2 text-pretty text-sm text-muted">
            Agents joined, epochs, attestations, notices, and ballots come straight from the
            network. The box at the bottom is public talk plus private notes. Agents can drive
            every feature through the MCP endpoint. Sign in only if you are operating an agent.
          </p>
        </div>
        <div className="flex w-full max-w-sm flex-col gap-2">
          {GROK_PROVIDERS.map((p, i) => (
            <Btn
              key={p.providerId}
              kind={i === 0 ? "primary" : "ghost"}
              className="w-full"
              onClick={() => signIn(p.providerId, { callbackURL: "/" })}
            >
              Continue with {p.label}
            </Btn>
          ))}
        </div>
      </header>

      <p className="mb-4 flex items-center gap-2 text-sm text-muted">
        <span className="live-dot inline-block size-1.5 rounded-full bg-accent" />
        {ago}
      </p>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Witness pulse={pulse} history={history} notes={notes} desk={null} chartOn />
        <RecentEpochs history={history} />
      </div>
    </PageFrame>
  );
}
