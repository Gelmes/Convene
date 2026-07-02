import { createTenantClient } from "@convene/db";
import { createParticipantSchema, createHealthReadingSchema } from "@convene/schemas";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { formatDateTime } from "@/lib/format";
import { BackLink, Button, Card, Input, PageShell } from "@/components/ui";

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

  // Latest reading per participant (readings are already newest-first).
  const latest = new Map<string, (typeof readings)[number]>();
  for (const r of readings) {
    if (!latest.has(r.participantId)) latest.set(r.participantId, r);
  }

  async function addParticipant(formData: FormData) {
    "use server";
    const { userId } = await requireMembership(orgId);
    const parsed = createParticipantSchema.safeParse({
      firstName: formData.get("firstName"),
      lastName: formData.get("lastName") || undefined,
    });
    if (!parsed.success) return;
    const db = createTenantClient(orgId, userId);
    await db.registrations.addNewParticipant(eventId, parsed.data);
    revalidatePath(`/o/${orgId}/e/${eventId}`);
  }

  async function saveReading(formData: FormData) {
    "use server";
    const { userId } = await requireMembership(orgId);
    const parsed = createHealthReadingSchema.safeParse({
      participantId: formData.get("participantId"),
      eventId,
      systolic: formData.get("systolic"),
      diastolic: formData.get("diastolic"),
      pulse: formData.get("pulse") || undefined,
      note: formData.get("note") || undefined,
    });
    if (!parsed.success) return;
    const db = createTenantClient(orgId, userId);
    await db.healthReadings.create(parsed.data);
    revalidatePath(`/o/${orgId}/e/${eventId}`);
  }

  return (
    <PageShell width="max-w-xl">
      <BackLink href={`/o/${orgId}`}>Events</BackLink>
      <h1 className="mt-3 text-2xl font-bold tracking-tight">{event.title}</h1>
      <p className="mt-1 text-sm text-stone-500">
        {formatDateTime(event.startsAt)}
        {event.location ? ` · ${event.location}` : ""}
      </p>

      <h2 className="mt-8 text-lg font-semibold">
        Participants{" "}
        <span className="font-normal text-stone-400">({roster.length})</span>
      </h2>

      <ul className="mt-3 space-y-3">
        {roster.length === 0 ? (
          <li>
            <Card className="p-6 text-center text-stone-500">
              No participants yet — add someone below.
            </Card>
          </li>
        ) : (
          roster.map((reg) => {
            const p = reg.participant;
            const last = latest.get(p.id);
            return (
              <li key={reg.id}>
                <Card className="overflow-hidden">
                  <details className="group">
                    <summary className="flex cursor-pointer select-none items-center justify-between p-4 transition-colors hover:bg-stone-50">
                      <span className="font-medium text-stone-900">
                        {p.firstName} {p.lastName ?? ""}
                      </span>
                      {last ? (
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium tabular-nums text-emerald-700 ring-1 ring-inset ring-emerald-600/10">
                          {last.systolic}/{last.diastolic}
                          {last.pulse ? (
                            <span className="text-emerald-600/70"> · {last.pulse}</span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-sm font-medium text-stone-400 transition-colors group-hover:text-emerald-700">
                          Take BP →
                        </span>
                      )}
                    </summary>

                    <form
                      action={saveReading}
                      className="space-y-3 border-t border-stone-100 bg-stone-50/50 p-4"
                    >
                      <input type="hidden" name="participantId" value={p.id} />
                      <div className="flex gap-2">
                        <label className="flex-1 text-xs font-medium text-stone-500">
                          Systolic
                          <Input
                            name="systolic"
                            type="number"
                            inputMode="numeric"
                            required
                            placeholder="120"
                            className="mt-1.5 py-3 text-center text-lg font-semibold tabular-nums"
                          />
                        </label>
                        <label className="flex-1 text-xs font-medium text-stone-500">
                          Diastolic
                          <Input
                            name="diastolic"
                            type="number"
                            inputMode="numeric"
                            required
                            placeholder="80"
                            className="mt-1.5 py-3 text-center text-lg font-semibold tabular-nums"
                          />
                        </label>
                        <label className="flex-1 text-xs font-medium text-stone-500">
                          Pulse
                          <Input
                            name="pulse"
                            type="number"
                            inputMode="numeric"
                            placeholder="72"
                            className="mt-1.5 py-3 text-center text-lg font-semibold tabular-nums"
                          />
                        </label>
                      </div>
                      <Input name="note" placeholder="Note (optional)" />
                      <Button variant="accent" className="w-full py-3">
                        Save reading
                      </Button>
                      {last ? (
                        <p className="text-center text-xs text-stone-400">
                          Last: {last.systolic}/{last.diastolic} at{" "}
                          {formatDateTime(last.takenAt)}
                        </p>
                      ) : null}
                    </form>
                  </details>
                </Card>
              </li>
            );
          })
        )}
      </ul>

      <Card className="mt-8 p-5">
        <h3 className="font-medium">Add participant</h3>
        <form action={addParticipant} className="mt-3 space-y-3">
          <div className="flex gap-2">
            <Input name="firstName" required placeholder="First name" />
            <Input name="lastName" placeholder="Last name" />
          </div>
          <Button className="w-full">Add to event</Button>
        </form>
      </Card>
    </PageShell>
  );
}
