"use client";

import { useEffect, useState } from "react";

function fmt(iso: string, tz?: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...(tz ? { timeZone: tz } : {}),
  });
}

/**
 * An absolute instant rendered in the VIEWER's local timezone — for activity
 * timestamps (readings, submissions, renewals) that aren't tied to an event
 * venue. Server renders UTC; the client re-renders in the browser zone.
 */
export function LocalTime({ iso, className }: { iso: string; className?: string }) {
  const [text, setText] = useState(() => fmt(iso, "UTC"));
  useEffect(() => setText(fmt(iso)), [iso]);
  return (
    <span className={className} suppressHydrationWarning>
      {text}
    </span>
  );
}
