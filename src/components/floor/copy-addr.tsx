import { useState } from "react";
import { shortAddr } from "@/lib/poa/format";
import { cn } from "./bits";

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.left = "-9999px";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      el.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function CopyAddr({
  address,
  full = false,
  className,
}: {
  address: string;
  full?: boolean;
  className?: string;
}) {
  const [note, setNote] = useState<"Copied" | "Could not copy" | null>(null);
  const shown = note ?? (full ? address : shortAddr(address));
  return (
    <button
      type="button"
      title={address}
      aria-label={note === "Copied" ? "Copied" : `Copy ${address}`}
      className={cn(
        "inline-flex min-h-11 max-w-full items-center truncate text-left font-mono text-sm text-foreground",
        className,
      )}
      onClick={(e) => {
        e.stopPropagation();
        void writeClipboard(address).then((ok) => {
          setNote(ok ? "Copied" : "Could not copy");
          window.setTimeout(() => setNote(null), 1200);
        });
      }}
    >
      {shown}
    </button>
  );
}
