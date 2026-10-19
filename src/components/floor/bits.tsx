import type { ButtonHTMLAttributes, ReactNode } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-border bg-card p-4", className)}>
      {children}
    </section>
  );
}

export function Kicker({ n, title, icon }: { n: string; title: string; icon?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="font-mono text-xs text-subtle">{n}</span>
      {icon ? <span className="text-muted">{icon}</span> : null}
      <h2 className="text-base font-medium tracking-tight">{title}</h2>
    </div>
  );
}

export function Btn({
  children,
  kind = "primary",
  className,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: "primary" | "ghost" }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex min-h-11 items-center justify-center rounded-sm px-4 text-sm font-medium transition-opacity duration-150 disabled:cursor-not-allowed disabled:opacity-40",
        kind === "primary"
          ? "bg-accent text-accent-fg hover:opacity-90"
          : "border border-border bg-transparent text-foreground hover:bg-card-2",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-muted">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "min-h-11 w-full rounded-sm border border-border bg-background px-3 text-base text-foreground placeholder:text-subtle";

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="break-words font-mono text-xl leading-tight tracking-tight text-foreground tabular-nums sm:text-2xl sm:leading-none">
        {value}
      </div>
      <div className="mt-1 text-sm text-muted">{label}</div>
    </div>
  );
}

export function PageFrame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:py-8">
      {children}
    </div>
  );
}

export function Wordmark() {
  return (
    <div className="min-w-0">
      <div className="text-lg font-medium tracking-tight">Proof Floor</div>
      <div className="text-sm text-muted">PoA agent kit</div>
    </div>
  );
}
