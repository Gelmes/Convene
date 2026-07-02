import { createTenantClient } from "@convene/db";
import { createParticipantSchema, createHealthReadingSchema } from "@convene/schemas";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { formatDateTime } from "@/lib/format";

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
    <main className="mx-auto max-w-xl p-4">
      <a href={`/o/${orgId}`} className="text-sm text-neutral-500 underline">
        ← {"Events"}
      </a>
      <h1 className="mt-2 text-2xl font-bold">{event.title}</h1>
      <p className="text-sm text-neutral-500">
        {formatDateTime(event.startsAt)}
        {event.location ? ` · ${event.location}` : ""}
      </p>

      <h2 className="mt-6 text-lg font-semibold">
        Participants ({roster.length})
      </h2>

      <ul className="mt-3 space-y-2">
        {roster.length === 0 ? (
          <li className="text-neutral-500">
            No participants yet — add someone below.
          </li>
        ) : (
          roster.map((reg) => {
            const p = reg.participant;
            const last = latest.get(p.id);
            return (
              <li
                key={reg.id}
                className="rounded border border-neutral-200 bg-white"
              >
                <details>
                  <summary className="flex cursor-pointer items-center justify-between p-3">
                    <span className="font-medium">
                      {p.firstName} {p.lastName ?? ""}
                    </span>
                    <span className="text-sm text-neutral-500">
                      {last
                        ? `${last.systolic}/${last.diastolic}${
                            last.pulse ? ` · ${last.pulse}bpm` : ""
                          }`
                        : "Take BP →"}
                    </span>
                  </summary>

                  <form
                    action={saveReading}
                    className="space-y-3 border-t border-neutral-100 p-3"
                  >
                    <input type="hidden" name="participantId" value={p.id} />
                    <div className="flex gap-2">
                      <label className="flex-1 text-xs text-neutral-600">
                        Systolic
                        <input
                          name="systolic"
                          type="number"
                          inputMode="numeric"
                          required
                          placeholder="120"
                          className="mt-1 w-full rounded border border-neutral-300 p-3 text-lg"
                        />
                      </label>
                      <label className="flex-1 text-xs text-neutral-600">
                        Diastolic
                        <input
                          name="diastolic"
                          type="number"
                          inputMode="numeric"
                          required
                          placeholder="80"
                          className="mt-1 w-full rounded border border-neutral-300 p-3 text-lg"
                        />
                      </label>
                      <label className="flex-1 text-xs text-neutral-600">
                        Pulse
                        <input
                          name="pulse"
                          type="number"
                          inputMode="numeric"
                          placeholder="72"
                          className="mt-1 w-full rounded border border-neutral-300 p-3 text-lg"
                        />
                      </label>
                    </div>
                    <input
                      name="note"
                      placeholder="Note (optional)"
                      className="w-full rounded border border-neutral-300 p-2"
                    />
                    <button className="w-full rounded bg-black p-3 text-white">
                      Save reading
                    </button>
                    {last ? (
                      <p className="text-xs text-neutral-400">
                        Last: {last.systolic}/{last.diastolic} at{" "}
                        {formatDateTime(last.takenAt)}
                      </p>
                    ) : null}
                  </form>
                </details>
              </li>
            );
          })
        )}
      </ul>

      <form
        action={addParticipant}
        className="mt-8 space-y-3 rounded border border-neutral-200 bg-white p-4"
      >
        <h3 className="font-medium">Add participant</h3>
        <div className="flex gap-2">
          <input
            name="firstName"
            required
            placeholder="First name"
            className="flex-1 rounded border border-neutral-300 p-2"
          />
          <input
            name="lastName"
            placeholder="Last name"
            className="flex-1 rounded border border-neutral-300 p-2"
          />
        </div>
        <button className="w-full rounded bg-neutral-800 p-2 text-white">
          Add to event
        </button>
      </form>
    </main>
  );
}
