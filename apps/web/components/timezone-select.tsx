"use client";

import { useEffect, useState } from "react";
import { Select } from "@/components/ui";

const FALLBACK = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function allZones(): string[] {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
      .supportedValuesOf;
    if (typeof fn === "function") return fn("timeZone");
  } catch {
    // fall through
  }
  return FALLBACK;
}

/**
 * Timezone picker. On a new event (no defaultValue) it auto-selects the host's
 * detected zone after mount; on edit it shows the event's saved zone. SSR
 * renders a stable value to avoid hydration mismatch.
 */
export function TimezoneSelect({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue?: string;
}) {
  const [value, setValue] = useState(defaultValue || "UTC");

  useEffect(() => {
    if (!defaultValue) {
      try {
        setValue(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
      } catch {
        /* keep UTC */
      }
    }
  }, [defaultValue]);

  const zones = allZones();
  const options = zones.includes(value) ? zones : [value, ...zones];

  return (
    <Select
      name={name}
      value={value}
      onChange={(e) => setValue(e.currentTarget.value)}
      className="mt-1 w-full"
    >
      {options.map((z) => (
        <option key={z} value={z}>
          {z.replace(/_/g, " ")}
        </option>
      ))}
    </Select>
  );
}
