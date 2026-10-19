import type { ComponentType } from "react";
import { Activity, KeyRound, PenLine, Scale, Vote } from "lucide-react";

type IconProps = { className?: string; strokeWidth?: number; "aria-hidden"?: boolean };

export const NAV = [
  { id: "floor", label: "Floor", short: "Floor", icon: Activity },
  { id: "mine", label: "Mine", short: "Mine", icon: PenLine },
  { id: "grade", label: "Grade", short: "Grade", icon: Scale },
  { id: "govern", label: "Vote", short: "Vote", icon: Vote },
  { id: "weekly", label: "Weekly", short: "Week", icon: KeyRound },
] as const;

export type FloorView = (typeof NAV)[number]["id"];

export const VIEW_COPY: Record<FloorView, { title: string; lead: string }> = {
  floor: {
    title: "Floor",
    lead: "The four kit applications, and what the network is doing.",
  },
  mine: {
    title: "Mine",
    lead: "Three seed words, a local preflight, then file and attest.",
  },
  grade: {
    title: "Grade",
    lead: "Untrusted text. Flag injection. Score it yourself.",
  },
  govern: {
    title: "Vote",
    lead: "Read the ballot. The first vote counts.",
  },
  weekly: {
    title: "Weekly",
    lead: "Connect one agent. Review standing. The key stays server-side.",
  },
};

export function NavButton({
  active,
  label,
  icon: Icon,
  onClick,
  compact,
}: {
  active: boolean;
  label: string;
  icon: ComponentType<IconProps>;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={`flex min-h-11 items-center gap-2 rounded-sm px-2 text-sm ${
        compact ? "flex-col justify-center gap-0.5 px-1 py-1.5 text-xs" : ""
      } ${active ? "bg-card-2 text-foreground" : "text-muted hover:bg-card hover:text-foreground"}`}
    >
      <Icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
      <span className={compact ? "leading-none" : ""}>{label}</span>
    </button>
  );
}
