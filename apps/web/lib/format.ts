import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/**
 * Format an instant in a specific IANA timezone with a zone label, e.g.
 * "Jul 8, 6:00 PM MDT". Events are anchored to their venue zone, so everyone
 * sees the same absolute moment regardless of where they're browsing.
 */
export function formatDateTime(d: Date | string, timeZone = "UTC"): string {
  const date = typeof d === "string" ? new Date(d) : d;
  try {
    return formatInTimeZone(date, timeZone, "MMM d, h:mm a zzz");
  } catch {
    return formatInTimeZone(date, "UTC", "MMM d, h:mm a 'UTC'");
  }
}

/** Wall-clock string (yyyy-MM-ddThh:mm) interpreted in `timeZone` → UTC instant. */
export function wallClockToUtc(local: string, timeZone: string): Date {
  return fromZonedTime(local, timeZone);
}

/** A UTC instant rendered as a datetime-local value in the given zone. */
export function toDateTimeLocalValue(d: Date, timeZone = "UTC"): string {
  return formatInTimeZone(d, timeZone, "yyyy-MM-dd'T'HH:mm");
}
