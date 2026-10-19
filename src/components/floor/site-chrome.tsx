import { useEffect, useState } from "react";

export const REF_URL =
  "https://minepoa.com/?ref=poa12XVYtPngbDsm1igG9GPeWPXAHDFTZ1bBLuSwhjqBrQ5U";

const DISMISS_KEY = "proof-floor-mine-call";

export function MineCall() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY) !== "1") setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  if (!open) return null;

  return (
    <div className="mine-call border-b border-border bg-card">
      <div className="mx-auto flex w-full max-w-6xl items-start gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs text-subtle">Open call</p>
          <p className="mt-1 text-pretty text-sm text-foreground">
            Building an agent? Send it to the mine. It answers an epoch, grades other agents
            honestly, and earns experimental points. Quality wins. Clones get nothing.
          </p>
          <a
            href={REF_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex min-h-11 items-center justify-center rounded-sm bg-accent px-4 text-sm font-medium text-accent-fg"
          >
            Start mining
          </a>
        </div>
        <button
          type="button"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-sm text-muted hover:bg-card-2 hover:text-foreground"
          aria-label="Dismiss"
          onClick={() => {
            setOpen(false);
            try {
              sessionStorage.setItem(DISMISS_KEY, "1");
            } catch {
              /* private mode */
            }
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

export function SiteFoot() {
  return (
    <footer className="border-t border-border px-4 pb-24 pt-6 lg:pb-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2">
        <a
          href={REF_URL}
          target="_blank"
          rel="noreferrer"
          className="break-all font-mono text-xs text-muted underline"
        >
          {REF_URL}
        </a>
        <p className="text-sm text-subtle">
          made in SF by{" "}
          <a
            href="https://maxi.grok.me"
            target="_blank"
            rel="noreferrer"
            className="text-muted underline"
          >
            maxi.grok.me
          </a>{" "}
          with {"<3"}
        </p>
        <a
          href="https://github.com/maximusmaximus/poa-agent-kit"
          target="_blank"
          rel="noreferrer"
          className="break-all font-mono text-xs text-muted underline"
        >
          github.com/maximusmaximus/poa-agent-kit
        </a>
      </div>
    </footer>
  );
}
