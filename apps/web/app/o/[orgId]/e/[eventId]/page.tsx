import { createTenantClient } from "@convene/db";
import { redirect } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { formatDateTime } from "@/lib/format";
import { BackLink, PageShell } from "@/components/ui";
import { FieldCapture, type RosterEntry } from "@/components/field-capture";

export default async function EventDetail({
  params,
}: {
  params: Promise<{ orgId: string; eventId: string }>;
}) {
  const { orgId, eventId } = await params;
  const { userId } = await requireMembership(orgId);

  const db = createTenantClient(orgId, userId);
  const event = await db.events.get(eventId);
  if (!event) redirect(`/o/${orgId}`);

  const roster = await db.registrations.listForEvent(eventId);
  const readings = await db.healthReadings.listForEvent(eventId);

  // Latest reading per participant (readings are newest-first).
  const latest = new Map<string, (typeof readings)[number]>();
  for (const r of readings) {
    if (!latest.has(r.participantId)) latest.set(r.participantId, r);
  }

  const entries: RosterEntry[] = roster.map((reg) => {
    const last = latest.get(reg.participantId);
    return {
      participantId: reg.participantId,
      firstName: reg.participant.firstName,
      lastName: reg.participant.lastName,
      latest: last
        ? {
            systolic: last.systolic,
            diastolic: last.diastolic,
            pulse: last.pulse,
            takenAt: last.takenAt.toISOString(),
          }
        : null,
    };
  });

  return (
    <PageShell width="max-w-xl">
      <BackLink href={`/o/${orgId}`}>Events</BackLink>
      <h1 className="mt-3 text-2xl font-bold tracking-tight">{event.title}</h1>
      <p className="mt-1 text-sm text-stone-500">
        {formatDateTime(event.startsAt)}
        {event.location ? ` · ${event.location}` : ""}
      </p>

      <FieldCapture orgId={orgId} eventId={eventId} roster={entries} />
    </PageShell>
  );
}
