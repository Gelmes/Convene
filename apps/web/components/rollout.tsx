"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui";

/**
 * The app-wide "declutter" pattern: a header row with a trigger button on the
 * right; tapping it rolls the form out directly underneath. Forms stay server
 * actions — this component only owns the open/closed state.
 *
 *   <Rollout heading={<h2>Events</h2>} label="+ Add event">
 *     <Card>…create form…</Card>
 *   </Rollout>
 */
export function Rollout({
  heading,
  label,
  openLabel = "✕ Close",
  accent = false,
  children,
}: {
  heading: ReactNode;
  label: string;
  openLabel?: string;
  accent?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        {heading}
        <Button
          type="button"
          variant={open ? "ghost" : accent ? "accent" : "ghost"}
          onClick={() => setOpen((o) => !o)}
          className={
            open
              ? "shrink-0 px-3 py-1.5 text-sm"
              : accent
                ? "shrink-0 px-3 py-1.5 text-sm"
                : "shrink-0 border border-stone-200 bg-white px-3 py-1.5 text-sm shadow-sm hover:border-stone-300"
          }
        >
          {open ? openLabel : label}
        </Button>
      </div>
      {open ? <div className="mt-3 animate-rise">{children}</div> : null}
    </div>
  );
}
