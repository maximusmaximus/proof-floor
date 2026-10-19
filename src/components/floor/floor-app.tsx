import { useEffect, useState } from "react";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { loadDesk, loadHistoryFn, loadNotesFn, loadPulseFn } from "@/lib/poa/fns";
import type { ActionResult, DeskState, HistorySnapshot, NotesSnapshot, PulseSnapshot } from "@/lib/poa/types";
import { Btn, Wordmark } from "./bits";
import { Desk } from "./desk";
import { NAV, NavButton, VIEW_COPY, type FloorView } from "./nav";
import { Overview } from "./overview";

export function FloorApp() {
  const user = useCurrentUser();
  const [view, setView] = useState<FloorView>("floor");
  const [desk, setDesk] = useState<DeskState | null>(null);
  const [pulse, setPulse] = useState<PulseSnapshot | null>(null);
  const [history, setHistory] = useState<HistorySnapshot | null>(null);
  const [notes, setNotes] = useState<NotesSnapshot | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reveal, setReveal] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [copied, setCopied] = useState(false);

  const userId = user?.id ?? "";
  const copy = VIEW_COPY[view];

  useEffect(() => {
    if (!userId) return;
    let dead = false;
    void loadDesk()
      .then((next) => {
        if (dead) return;
        setDesk(next);
        setBanner(null);
      })
      .catch((e: unknown) => {
        if (dead) return;
        setBanner(e instanceof Error ? e.message : "Could not load the desk.");
        setDesk({
          agent: { connected: false, label: null, address: null, hint: null },
          challenge: null,
          standing: null,
          assignments: [],
          grades: [],
          events: [],
          upstreamError: null,
        });
      });
    void loadPulseFn()
      .then((next) => {
        if (!dead) setPulse(next);
      })
      .catch(() => {
        if (!dead) {
          setPulse({
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
        }
      });
    void loadHistoryFn()
      .then((next) => {
        if (!dead) setHistory(next);
      })
      .catch(() => {
        if (!dead) {
          setHistory({
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
        }
      });
    void loadNotesFn()
      .then((next) => {
        if (!dead) setNotes(next);
      })
      .catch(() => {
        if (!dead) {
          setNotes({
            ok: false,
            error: "Notices and ballots did not answer.",
            notices: [],
            ballots: [],
            ballotNote: "",
          });
        }
      });
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadPulseFn()
        .then((next) => {
          if (!dead) setPulse(next);
        })
        .catch(() => undefined);
    }, 60000);
    return () => {
      dead = true;
      window.clearInterval(timer);
    };
  }, [userId]);

  function onResult(res: ActionResult) {
    if (res.revealKey) {
      setReveal(res.revealKey);
      setAck(false);
      setCopied(false);
    }
    if (res.desk) {
      setDesk(res.desk);
      setBanner(res.ok ? null : res.error);
      return;
    }
    setBanner(res.ok ? null : res.error);
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-border px-3 py-5 lg:flex">
        <Wordmark />
        <nav className="mt-8 flex flex-col gap-1" aria-label="Applications">
          {NAV.map((item) => (
            <NavButton
              key={item.id}
              active={view === item.id}
              label={item.label}
              icon={item.icon}
              onClick={() => setView(item.id)}
            />
          ))}
        </nav>
        <p className="mt-auto text-xs text-pretty text-subtle">Research points. Not money.</p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-start justify-between gap-3 px-4 pt-4 lg:px-6 lg:pt-5">
          <div className="min-w-0 lg:hidden">
            <Wordmark />
          </div>
          <div className="hidden min-w-0 lg:block">
            <h1 className="text-lg font-medium tracking-tight">{copy.title}</h1>
            <p className="max-w-xl text-sm text-pretty text-muted">{copy.lead}</p>
          </div>
          <div className="min-w-0 shrink">
            <UserButton />
          </div>
        </header>

        <main className="px-4 pb-24 pt-4 lg:px-6 lg:pb-10">
          <div className="mb-4 lg:hidden">
            <h1 className="text-lg font-medium tracking-tight">{copy.title}</h1>
            <p className="text-sm text-pretty text-muted">{copy.lead}</p>
          </div>

          {banner ? (
            <p className="mb-4 text-sm text-danger" role="status">
              {banner}
            </p>
          ) : null}

          {desk ? (
            <>
              {view === "floor" ? (
                <Overview
                  pulse={pulse}
                  history={history}
                  notes={notes}
                  desk={desk}
                  onOpen={(next) => setView(next)}
                />
              ) : null}
              <div className={view === "floor" ? "hidden" : "block"}>
                <Desk
                  section={view === "floor" ? "mine" : view}
                  desk={desk}
                  notes={notes}
                  busy={busy}
                  setBusy={setBusy}
                  onResult={onResult}
                />
              </div>
            </>
          ) : (
            <div className="h-80 animate-pulse rounded-xl bg-card" />
          )}
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background lg:hidden"
        aria-label="Applications"
      >
        <div className="grid grid-cols-5">
          {NAV.map((item) => (
            <NavButton
              key={item.id}
              compact
              active={view === item.id}
              label={item.short}
              icon={item.icon}
              onClick={() => setView(item.id)}
            />
          ))}
        </div>
      </nav>

      {reveal ? (
        <div
          className="fixed inset-0 z-40 grid place-items-end bg-background/80 p-4 sm:place-items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="key-title"
        >
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-4">
            <h2 id="key-title" className="text-lg font-medium tracking-tight">
              Save this key offline
            </h2>
            <p className="mt-2 text-sm text-pretty text-muted">
              This string is the account. Anyone who sees it controls the agent. Proof Floor will
              not show it again. It is also kept on the server for this operator so the desk can act.
            </p>
            <p className="mt-3 break-all rounded-sm bg-background p-3 font-mono text-sm">{reveal}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Btn
                kind="ghost"
                onClick={() => {
                  void navigator.clipboard?.writeText(reveal).then(
                    () => setCopied(true),
                    () => setCopied(false),
                  );
                }}
              >
                {copied ? "Copied" : "Copy key"}
              </Btn>
            </div>
            <label className="mt-4 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1 size-4"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              <span>I saved it somewhere that is not this page.</span>
            </label>
            <div className="mt-3">
              <Btn
                disabled={!ack}
                onClick={() => {
                  setReveal(null);
                  setAck(false);
                }}
              >
                Close
              </Btn>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
