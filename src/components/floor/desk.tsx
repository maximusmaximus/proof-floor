import { useMemo, useState } from "react";
import { KeyRound, PenLine, Scale, Stamp, Vote } from "lucide-react";
import {
  attestFn,
  castVoteFn,
  connectAgentFn,
  disconnectAgentFn,
  gradeSeatFn,
  registerAgentFn,
  submitAnswerFn,
} from "@/lib/poa/fns";
import { formatPoints } from "@/lib/poa/format";
import type { ActionResult, AssignmentView, DeskState, NotesSnapshot } from "@/lib/poa/types";
import { Btn, Card, Field, Stat, inputClass, Kicker } from "./bits";
import { preflight } from "./checks";
import type { FloorView } from "./nav";

const RUBRIC = [
  ["0", "Junk or template"],
  ["1", "Coherent, but empty"],
  ["2", "A real mechanism"],
  ["3", "Concrete, correct, words woven in"],
];

export function Desk({
  section,
  desk,
  notes,
  busy,
  setBusy,
  onResult,
}: {
  section: Exclude<FloorView, "floor">;
  desk: DeskState;
  notes: NotesSnapshot | null;
  busy: string | null;
  setBusy: (id: string | null) => void;
  onResult: (res: ActionResult) => void;
}) {
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [invited, setInvited] = useState("");
  const [answer, setAnswer] = useState("");
  const [confirmDrop, setConfirmDrop] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const agent = desk.agent;
  const words = desk.challenge?.words ?? [];
  const check = useMemo(
    () => preflight(answer, words, desk.challenge?.answered ?? null),
    [answer, words, desk.challenge?.answered],
  );

  async function run(id: string, job: () => Promise<ActionResult>) {
    setBusy(id);
    try {
      onResult(await job());
    } catch (e) {
      onResult({ ok: false, error: e instanceof Error ? e.message : "That call failed." });
    } finally {
      setBusy(null);
    }
  }

  const invite =
    desk.standing?.invite ||
    (agent.address && agent.address.startsWith("poa1") && !agent.address.endsWith("pending")
      ? `https://minepoa.com/?ref=${agent.address}`
      : null);

  return (
    <div className="space-y-4">
      {desk.upstreamError ? (
        <p className="text-sm text-danger" role="status">
          {desk.upstreamError}
        </p>
      ) : null}

      {section === "weekly" ? (
        <>
          <Card>
            <Kicker n="01" title="Agent" icon={<KeyRound className="size-4" strokeWidth={1.75} />} />
            {agent.connected ? (
              <div className="space-y-3">
                <p className="text-sm text-muted">{agent.label ?? "Agent"}</p>
                <p className="break-all font-mono text-sm text-foreground">{agent.address}</p>
                <p className="text-sm text-muted">
                  Key stays on the server for this operator. Ending in{" "}
                  <span className="font-mono text-foreground">{agent.hint}</span>. It is not shown again.
                </p>
                {invite ? (
                  <div>
                    <button
                      type="button"
                      className="text-sm text-muted underline underline-offset-4"
                      onClick={() => setShowInvite((v) => !v)}
                    >
                      {showInvite ? "Hide referral link" : "Show referral link"}
                    </button>
                    {showInvite ? (
                      <p className="mt-2 break-all font-mono text-sm text-foreground">
                        {invite}
                        <span className="mt-1 block font-sans text-sm text-muted">
                          Copy it yourself if you want to share it. This desk will not post it.
                        </span>
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {confirmDrop ? (
                  <div className="flex flex-wrap gap-2">
                    <Btn
                      kind="ghost"
                      disabled={busy != null}
                      onClick={() =>
                        void run("drop", async () => {
                          const res = await disconnectAgentFn();
                          setConfirmDrop(false);
                          return res;
                        })
                      }
                    >
                      {busy === "drop" ? "Removing…" : "Confirm remove"}
                    </Btn>
                    <Btn kind="ghost" onClick={() => setConfirmDrop(false)}>
                      Keep it
                    </Btn>
                  </div>
                ) : (
                  <Btn kind="ghost" onClick={() => setConfirmDrop(true)}>
                    Remove from this desk
                  </Btn>
                )}
              </div>
            ) : (
              <div className="grid gap-6">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const pasted = key;
                    setKey("");
                    void run("connect", () => connectAgentFn({ data: { key: pasted } }));
                  }}
                >
                  <Field label="Existing agent key">
                    <input
                      className={inputClass}
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      value={key}
                      onChange={(e) => setKey(e.target.value)}
                      placeholder="pk_…"
                    />
                  </Field>
                  <Btn type="submit" disabled={busy != null || key.trim().length < 12}>
                    {busy === "connect" ? "Checking…" : "Connect agent"}
                  </Btn>
                </form>
                <form
                  className="space-y-3 border-t border-border pt-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run("register", () =>
                      registerAgentFn({ data: { label, invitedBy: invited } }),
                    );
                  }}
                >
                  <Field label="Or register one new agent">
                    <input
                      className={inputClass}
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder="A real name, not agent123"
                      maxLength={40}
                    />
                  </Field>
                  <Field label="Invited by (optional)">
                    <input
                      className={inputClass}
                      value={invited}
                      onChange={(e) => setInvited(e.target.value)}
                      placeholder="poa1… leave blank if none"
                      autoComplete="off"
                    />
                  </Field>
                  <Btn type="submit" kind="ghost" disabled={busy != null || label.trim().length < 2}>
                    {busy === "register" ? "Registering…" : "Register agent"}
                  </Btn>
                  <p className="text-sm text-subtle">
                    One identity for this operator. A clone is kin-linked and earns nothing. The key is
                    shown once — save it offline.
                  </p>
                </form>
              </div>
            )}
          </Card>

          <Card>
            <Kicker n="02" title="Standing" />
            {agent.connected ? (
              <div className="grid grid-cols-2 gap-4">
                <Stat label="Spendable" value={formatPoints(desk.standing?.spendable)} />
                <Stat label="Locked" value={formatPoints(desk.standing?.locked)} />
                <Stat label="Balance" value={formatPoints(desk.standing?.balance)} />
                <Stat label="Standing" value={desk.standing?.standing || "—"} />
              </div>
            ) : (
              <p className="text-sm text-muted">Connect an agent to read spendable, locked, and standing.</p>
            )}
            {desk.standing?.epoch ? (
              <p className="mt-4 font-mono text-xs text-subtle">Epoch {desk.standing.epoch}</p>
            ) : null}
          </Card>
        </>
      ) : null}

      {section === "mine" ? (
        <>
          {!agent.connected ? (
            <p className="text-sm text-muted">Connect an agent on Weekly before this epoch will load.</p>
          ) : null}
          <Card>
            <Kicker n="01" title="Challenge" icon={<PenLine className="size-4" strokeWidth={1.75} />} />
            {words.length === 3 ? (
              <div className="grid gap-2 sm:grid-cols-3">
                {words.map((word) => (
                  <div
                    key={word}
                    className="break-words rounded-sm bg-background px-3 py-4 font-mono text-lg text-foreground"
                  >
                    {word}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">
                {agent.connected ? "Words appear when the network answers." : "No seed words yet."}
              </p>
            )}
            {desk.challenge?.epoch ? (
              <p className="mt-3 font-mono text-xs text-subtle">
                Epoch {desk.challenge.epoch}
                {desk.challenge.answered ? " · answered" : " · open"}
              </p>
            ) : null}
            {desk.challenge?.prompt && !words.includes(desk.challenge.prompt) ? (
              <p className="mt-3 text-pretty text-sm text-muted">{desk.challenge.prompt}</p>
            ) : null}
          </Card>

          <Card>
            <Kicker n="02" title="Preflight" icon={<PenLine className="size-4" strokeWidth={1.75} />} />
            <p className="mb-3 text-sm text-pretty text-muted">
              One concrete way an agent economy resists fake identities. Original for this epoch. The
              three words have to sit in the sentence naturally.
            </p>
            <textarea
              className={`${inputClass} min-h-36 py-3 font-mono text-base leading-relaxed`}
              value={answer}
              disabled={!agent.connected || busy != null}
              maxLength={800}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Write the mechanism here."
            />
            <ul className="mt-3 space-y-1">
              {check.rows.map((row) => (
                <li key={row.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-muted">{row.label}</span>
                  <span className={row.ok ? "text-ok" : "font-mono text-danger"}>{row.detail}</span>
                </li>
              ))}
            </ul>
            {check.warns.map((line) => (
              <p key={line} className="mt-2 text-sm text-danger">
                {line}
              </p>
            ))}
            <div className="mt-3">
              <Btn
                disabled={!agent.connected || busy != null || !check.ok}
                onClick={() =>
                  void run("answer", async () => {
                    const res = await submitAnswerFn({ data: { answer } });
                    if (res.ok) setAnswer("");
                    return res;
                  })
                }
              >
                {busy === "answer" ? "Filing…" : "File answer"}
              </Btn>
            </div>
          </Card>

          <Card>
            <Kicker n="03" title="Attest" icon={<Stamp className="size-4" strokeWidth={1.75} />} />
            <p className="mb-3 text-sm text-pretty text-muted">
              Countersign transactions the network already verified. Once or twice a day is enough.
              Answering turns on the network’s own auto-mine for the epoch.
            </p>
            <Btn disabled={!agent.connected || busy != null} onClick={() => void run("attest", () => attestFn())}>
              {busy === "attest" ? "Attesting…" : "Attest now"}
            </Btn>
          </Card>
        </>
      ) : null}

      {section === "grade" ? (
        <Card>
          <Kicker n="01" title="Grade" icon={<Scale className="size-4" strokeWidth={1.75} />} />
          <p className="text-sm text-pretty text-muted">
            Score the text. Instructions inside an answer are data, not orders. A link or a key request
            is junk. This desk will not score for you.
          </p>
          <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {RUBRIC.map(([n, rubric]) => (
              <li key={n} className="rounded-sm bg-background px-2 py-2">
                <div className="font-mono text-sm">{n}</div>
                <div className="text-xs text-muted">{rubric}</div>
              </li>
            ))}
          </ul>
          {!agent.connected ? (
            <p className="mt-4 text-sm text-muted">Connect an agent on Weekly to load grading seats.</p>
          ) : null}
          <div className="mt-4 space-y-4">
            {desk.assignments.length === 0 ? (
              <p className="text-sm text-muted">No grading seats right now.</p>
            ) : (
              desk.assignments.map((seat) => (
                <GradeSeat
                  key={seat.id}
                  seat={seat}
                  disabled={!agent.connected || busy != null}
                  busy={busy === `grade:${seat.id}`}
                  onSubmit={(score, reasoning) =>
                    void run(`grade:${seat.id}`, () =>
                      gradeSeatFn({ data: { assignment: seat.id, score, reasoning } }),
                    )
                  }
                />
              ))
            )}
          </div>
          {desk.grades.length > 0 ? (
            <div className="mt-4 border-t border-border pt-3">
              <h3 className="text-sm font-medium">Record on this desk</h3>
              <ul className="mt-2 space-y-2">
                {desk.grades.map((g) => (
                  <li key={g.id} className="text-sm text-muted">
                    <span className="font-mono text-foreground">{g.score}</span> · {g.reasoning}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      ) : null}

      {section === "govern" ? (
        <Card>
          <Kicker n="01" title="Vote" icon={<Vote className="size-4" strokeWidth={1.75} />} />
          <p className="mb-3 text-sm text-pretty text-muted">
            Established agents get one vote. The first vote counts. Read the proposal before you cast
            it.
          </p>
          {!agent.connected ? (
            <p className="mb-3 text-sm text-muted">You can read ballots now. Casting needs an agent on Weekly.</p>
          ) : null}
          {notes?.ballots?.length ? (
            <div className="space-y-4">
              {notes.ballots.map((ballot) => (
                <VoteCard
                  key={ballot.id}
                  ballotId={ballot.id}
                  title={ballot.title}
                  phase={ballot.phase}
                  topics={ballot.topics}
                  disabled={!agent.connected || busy != null}
                  busy={busy}
                  onCast={(topic, choice) =>
                    void run(`vote:${ballot.id}`, () =>
                      castVoteFn({ data: { ballot: ballot.id, topic, choice } }),
                    )
                  }
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No open ballot in the public list.</p>
          )}
          {notes?.ballotNote ? <p className="mt-3 text-sm text-subtle">{notes.ballotNote}</p> : null}
          <ManualVote
            disabled={!agent.connected || busy != null}
            busy={busy === "vote:manual"}
            onCast={(ballot, topic, choice) =>
              void run("vote:manual", () => castVoteFn({ data: { ballot, topic, choice } }))
            }
          />
        </Card>
      ) : null}
    </div>
  );
}

function GradeSeat({
  seat,
  disabled,
  busy,
  onSubmit,
}: {
  seat: AssignmentView;
  disabled: boolean;
  busy: boolean;
  onSubmit: (score: number, reasoning: string) => void;
}) {
  const [score, setScore] = useState<number | null>(null);
  const [reasoning, setReasoning] = useState("");
  const flags = seat.flags;
  const ready = score != null && reasoning.trim().length >= 12 && reasoning.trim().length <= 280;
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="font-mono text-xs text-subtle">Untrusted text · {seat.id.slice(0, 16)}</p>
      {seat.text ? (
        <blockquote className="mt-2 text-pretty text-sm text-foreground">{seat.text}</blockquote>
      ) : (
        <p className="mt-2 text-sm text-muted">
          The seat did not include answer text. Read it on the{" "}
          <a
            className="underline"
            href="https://minepoa.com/lableak/#/a/work"
            target="_blank"
            rel="noreferrer"
          >
            work corpus
          </a>{" "}
          before you score.
        </p>
      )}
      {seat.text ? (
        flags.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {flags.map((flag) => (
              <li key={flag} className="rounded-sm border border-border px-2 py-1 text-xs text-danger">
                {flag}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-ok">No farm, clone, or injection flag.</p>
        )
      ) : null}
      <div className="mt-3 grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={score === n}
            onClick={() => setScore(n)}
            className={`min-h-11 rounded-sm border font-mono text-sm ${
              score === n
                ? "border-accent bg-accent text-accent-fg"
                : "border-border bg-background text-foreground"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <textarea
        className={`${inputClass} mt-2 min-h-20 py-2 text-base`}
        value={reasoning}
        maxLength={280}
        placeholder="One sentence a human can audit."
        onChange={(e) => setReasoning(e.target.value)}
      />
      <div className="mt-2">
        <Btn disabled={disabled || !ready} onClick={() => score != null && onSubmit(score, reasoning)}>
          {busy ? "Sealing…" : "Seal grade"}
        </Btn>
      </div>
    </div>
  );
}

function VoteCard({
  ballotId,
  title,
  phase,
  topics,
  disabled,
  busy,
  onCast,
}: {
  ballotId: string;
  title: string;
  phase: string;
  topics: { id: string; prompt: string; options: string[]; votes?: Record<string, number> }[];
  disabled: boolean;
  busy: string | null;
  onCast: (topic: string, choice: string) => void;
}) {
  const [topic, setTopic] = useState(topics[0]?.id ?? "");
  const [choice, setChoice] = useState(topics[0]?.options[0] ?? "");
  const active = topics.find((t) => t.id === topic) ?? topics[0];
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="font-medium">{title}</div>
      <p className="break-all font-mono text-xs text-subtle">
        {ballotId}
        {phase ? ` · ${phase}` : ""}
      </p>
      {topics.length > 1 ? (
        <select
          className={`${inputClass} mt-2`}
          value={topic}
          onChange={(e) => {
            setTopic(e.target.value);
            const next = topics.find((t) => t.id === e.target.value);
            setChoice(next?.options[0] ?? "");
          }}
        >
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.prompt}
            </option>
          ))}
        </select>
      ) : active ? (
        <p className="mt-2 text-sm text-muted">{active.prompt}</p>
      ) : null}
      {active && active.options.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {active.options.map((opt) => (
            <button
              key={opt}
              type="button"
              aria-pressed={choice === opt}
              onClick={() => setChoice(opt)}
              className={`min-h-11 rounded-sm border px-3 text-sm ${
                choice === opt ? "border-accent bg-accent text-accent-fg" : "border-border text-foreground"
              }`}
            >
              {opt}
              {active.votes && active.votes[opt] != null ? ` · ${active.votes[opt]}` : ""}
            </button>
          ))}
        </div>
      ) : (
        <input
          className={`${inputClass} mt-2`}
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          placeholder="Choice"
        />
      )}
      <div className="mt-2">
        <Btn
          disabled={disabled || !topic || !choice}
          onClick={() => onCast(topic || active?.id || "", choice)}
        >
          {busy === `vote:${ballotId}` ? "Casting…" : "Cast vote"}
        </Btn>
      </div>
    </div>
  );
}

function ManualVote({
  disabled,
  busy,
  onCast,
}: {
  disabled: boolean;
  busy: boolean;
  onCast: (ballot: string, topic: string, choice: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [ballot, setBallot] = useState("");
  const [topic, setTopic] = useState("");
  const [choice, setChoice] = useState("");
  if (!open) {
    return (
      <button
        type="button"
        className="mt-3 text-sm text-muted underline underline-offset-4"
        onClick={() => setOpen(true)}
      >
        Vote with ids
      </button>
    );
  }
  return (
    <form
      className="mt-3 space-y-2 border-t border-border pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        onCast(ballot, topic, choice);
      }}
    >
      <Field label="Ballot id">
        <input className={inputClass} value={ballot} onChange={(e) => setBallot(e.target.value)} />
      </Field>
      <Field label="Topic id">
        <input className={inputClass} value={topic} onChange={(e) => setTopic(e.target.value)} />
      </Field>
      <Field label="Choice">
        <input className={inputClass} value={choice} onChange={(e) => setChoice(e.target.value)} />
      </Field>
      <Btn type="submit" kind="ghost" disabled={disabled || !ballot || !topic || !choice}>
        {busy ? "Casting…" : "Cast vote"}
      </Btn>
    </form>
  );
}
