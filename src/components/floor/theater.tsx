import { useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCount, formatPoints } from "@/lib/poa/format";
import { loadIdeasFn } from "@/lib/poa/fns";
import { fallbackIdeas, pickSlides, type FloorIdea } from "@/lib/poa/ideas";
import { IDLE_MS, stepTheater, type TheaterState } from "@/lib/poa/theater";
import type { HistorySnapshot, NotesSnapshot, PulseSnapshot } from "@/lib/poa/types";

type Sample = { t: number; agents: number; holders: number; epochs: number; txs: number };

const SAMPLE_KEY = "proof-floor-health";

function loadSamples(): Sample[] {
  try {
    const raw = sessionStorage.getItem(SAMPLE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Sample[]) : [];
    return Array.isArray(parsed) ? parsed.slice(-36) : [];
  } catch {
    return [];
  }
}

function remember(samples: Sample[]) {
  try {
    sessionStorage.setItem(SAMPLE_KEY, JSON.stringify(samples.slice(-36)));
  } catch {
    /* private mode */
  }
}

export function Theater({
  pulse,
  history,
  notes,
}: {
  pulse: PulseSnapshot | null;
  history: HistorySnapshot | null;
  notes: NotesSnapshot | null;
}) {
  const [ideas, setIdeas] = useState<FloorIdea[]>(() => fallbackIdeas());
  const [samples, setSamples] = useState<Sample[]>([]);
  const [state, setState] = useState<TheaterState>(() => ({
    lastActive: Date.now(),
    open: false,
    index: 0,
    slideAt: Date.now(),
  }));
  const [now, setNow] = useState(() => Date.now());
  const active = useRef(false);

  useEffect(() => {
    setSamples(loadSamples());
    void loadIdeasFn()
      .then((next) => {
        if (next.ideas.length > 0) setIdeas(next.ideas);
      })
      .catch(() => undefined);
    const mark = () => {
      active.current = true;
    };
    const events = ["pointerdown", "pointermove", "wheel", "touchstart", "keydown"] as const;
    for (const name of events) window.addEventListener(name, mark, { passive: true });
    const timer = window.setInterval(() => {
      const tick = Date.now();
      setNow(tick);
      if (document.visibilityState !== "visible") return;
      const moved = active.current;
      active.current = false;
      setState((prev) => stepTheater(prev, tick, moved, slideCount.current));
    }, 400);
    return () => {
      window.clearInterval(timer);
      for (const name of events) window.removeEventListener(name, mark);
    };
  }, []);

  useEffect(() => {
    if (!pulse?.ok) return;
    setSamples((prev) => {
      const point: Sample = {
        t: Date.now(),
        agents: pulse.agentsJoined ?? 0,
        holders: pulse.holders ?? 0,
        epochs: pulse.epochsClosed ?? 0,
        txs: pulse.txs ?? 0,
      };
      const last = prev[prev.length - 1];
      if (last && last.agents === point.agents && last.txs === point.txs && point.t - last.t < 60_000) return prev;
      const next = [...prev, point].slice(-36);
      remember(next);
      return next;
    });
  }, [pulse]);

  const ballot = notes?.ballots.find((item) => item.topics.some((topic) => topic.options.length > 0)) ?? null;
  const slides = useMemo(() => pickSlides(ideas, ballot != null), [ideas, ballot]);
  const slideCount = useRef(slides.length);
  slideCount.current = slides.length;

  useEffect(() => {
    if (!state.open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [state.open]);

  if (!state.open || slides.length === 0) return null;
  const id = slides[state.index % slides.length];
  const idea = ideas.find((item) => item.id === id) ?? fallbackIdeas().find((item) => item.id === id);
  const progress = Math.max(0, Math.min(1, (now - state.slideAt) / IDLE_MS));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background text-foreground" role="dialog" aria-label={idea?.title ?? "Network charts"}>
      <div className="h-1 bg-border">
        <div className="h-full origin-left bg-accent" style={{ transform: `scaleX(${progress})` }} />
      </div>
      <div className="flex items-start justify-between gap-4 px-5 pt-5 sm:px-10 sm:pt-8">
        <div className="min-w-0">
          <p className="font-mono text-xs text-subtle">Suggestion · {state.index % slides.length + 1} of {slides.length}</p>
          <h2 className="mt-2 text-balance text-4xl font-medium tracking-tight sm:text-6xl">{idea?.title ?? "Network"}</h2>
          <p className="mt-2 max-w-2xl text-pretty text-sm text-muted sm:text-base">{idea?.detail}</p>
        </div>
        <button
          type="button"
          className="inline-flex min-h-11 shrink-0 items-center text-sm text-muted"
          onClick={() => setState((prev) => stepTheater(prev, Date.now(), true, slides.length))}
        >
          Back
        </button>
      </div>
      <div className="min-h-0 flex-1 px-2 py-4 sm:px-8">
        {id === "health" ? <HealthSlide pulse={pulse} samples={samples} /> : null}
        {id === "epochs" ? <EpochSlide history={history} /> : null}
        {id === "ballot" && ballot ? <BallotSlide ballot={ballot} /> : null}
      </div>
      <p className="px-5 pb-6 font-mono text-xs text-subtle sm:px-10">Still. The next chart comes in two minutes. Move to leave.</p>
    </div>
  );
}

function tipStyle() {
  return { background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, color: "var(--color-foreground)" };
}

function HealthSlide({ pulse, samples }: { pulse: PulseSnapshot | null; samples: Sample[] }) {
  const rows = [
    { name: "Agents", value: pulse?.agentsJoined ?? 0 },
    { name: "Holders", value: pulse?.holders ?? 0 },
    { name: "Epochs", value: pulse?.epochsClosed ?? 0 },
    { name: "Transactions", value: pulse?.txs ?? 0 },
  ];
  const max = Math.log10(Math.max(...rows.map((row) => row.value), 1) + 1);
  return (
    <div className="flex h-full min-h-64 flex-col gap-6">
      <ul className="space-y-4">
        {rows.map((row) => (
          <li key={row.name}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-muted">{row.name}</span>
              <span className="font-mono text-2xl tabular-nums sm:text-4xl">{formatCount(row.value)}</span>
            </div>
            <div className="mt-2 h-3 rounded-sm bg-card">
              <div
                className="h-full rounded-sm bg-accent"
                style={{ width: `${Math.max(6, (Math.log10(row.value + 1) / max) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="font-mono text-xs text-subtle">
        Log scale. {pulse?.finalTxs != null ? `${formatCount(pulse.finalTxs)} final` : "Finality pending"}
        {pulse?.supply ? ` · ${formatPoints(pulse.supply)} points` : ""}
      </p>
      {samples.length >= 2 ? (
        <div className="min-h-40 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={samples}>
              <CartesianGrid stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="t" hide />
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <Tooltip
                contentStyle={tipStyle()}
                labelFormatter={() => "This tab"}
                formatter={(value, name) => [formatCount(Number(value ?? 0)), name === "txs" ? "Transactions" : "Agents"]}
              />
              <Line type="monotone" dataKey="txs" stroke="var(--color-accent)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="agents" stroke="var(--color-ok)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-sm text-muted">The line fills while this tab stays open.</p>
      )}
    </div>
  );
}

function EpochSlide({ history }: { history: HistorySnapshot | null }) {
  const rows = history?.ok ? history.recent : [];
  if (rows.length === 0) return <p className="text-sm text-muted">No closed epochs in this snapshot.</p>;
  return (
    <div className="flex h-full min-h-72 flex-col">
      <ul className="mb-3 flex flex-wrap gap-4 px-2 text-xs text-muted">
        <li className="flex items-center gap-2"><span className="inline-block size-2 bg-accent" /> Answers</li>
        <li className="flex items-center gap-2"><span className="inline-block size-2 bg-muted" /> Attestations</li>
        <li className="flex items-center gap-2"><span className="inline-block size-2 bg-ok" /> Graders</li>
      </ul>
      <div className="min-h-0 flex-1">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} barGap={2}>
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="epoch" stroke="var(--color-subtle)" tickLine={false} axisLine={false} />
          <YAxis stroke="var(--color-subtle)" tickLine={false} axisLine={false} width={36} />
          <Tooltip contentStyle={tipStyle()} />
          <Bar dataKey="answers" fill="var(--color-accent)" radius={[2, 2, 0, 0]} />
          <Bar dataKey="attestations" fill="var(--color-muted)" radius={[2, 2, 0, 0]} />
          <Bar dataKey="graders" fill="var(--color-ok)" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}

function BallotSlide({ ballot }: { ballot: NonNullable<NotesSnapshot["ballots"][number]> }) {
  const topic = ballot.topics.find((item) => item.options.length > 0) ?? ballot.topics[0];
  if (!topic) return null;
  const rows = topic.options.map((name) => ({ name: name.length > 28 ? `${name.slice(0, 26)}…` : name, votes: topic.votes[name] ?? 0 }));
  return (
    <div className="flex h-full min-h-72 flex-col">
      <p className="mb-4 max-w-3xl text-pretty text-lg text-muted">{topic.prompt || ballot.title}</p>
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" stroke="var(--color-subtle)" tickLine={false} axisLine={false} width={140} />
            <Tooltip contentStyle={tipStyle()} />
            <Bar dataKey="votes" fill="var(--color-accent)" radius={[0, 2, 2, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
