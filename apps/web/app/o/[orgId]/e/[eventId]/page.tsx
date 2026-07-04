import { createTenantClient } from "@convene/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { formatDateTime } from "@/lib/format";
import { r2Configured, r2Delete, r2PresignGet } from "@/lib/r2";
import { BackLink, Badge, Button, Card, PageShell } from "@/components/ui";
import { CopyField } from "@/components/copy-field";
import { FieldCapture, type RosterEntry } from "@/components/field-capture";
import { PhotoUploader } from "@/components/photo-uploader";

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
  const publishedForms = await db.forms.listPublished();
  const allStages = await db.programs.listAllStages();

  const origin = process.env.AUTH_URL ?? "http://localhost:3000";
  const publicUrl = `${origin.replace(/\/$/, "")}/r/${eventId}`;

  const photosEnabled = r2Configured();
  const photos = photosEnabled ? await db.photos.listForEvent(eventId) : [];
  const photoUrls = await Promise.all(
    photos.map(async (p) => ({
      ...p,
      url: await r2PresignGet(p.storageKey),
    })),
  );

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

  async function deletePhoto(formData: FormData) {
    "use server";
    const { userId } = await requireMembership(orgId);
    const db = createTenantClient(orgId, userId);
    const photo = await db.photos.delete(String(formData.get("photoId")));
    if (photo) await r2Delete(photo.storageKey).catch(() => {});
    revalidatePath(`/o/${orgId}/e/${eventId}`);
  }

  async function togglePublic() {
    "use server";
    const { userId } = await requireMembership(orgId);
    const db = createTenantClient(orgId, userId);
    const current = await db.events.get(eventId);
    if (!current) return;
    await db.events.setPublicRegistration(eventId, !current.publicRegistration);
    revalidatePath(`/o/${orgId}/e/${eventId}`);
  }

  async function setIntakeForm(formData: FormData) {
    "use server";
    const { userId } = await requireMembership(orgId);
    const db = createTenantClient(orgId, userId);
    const formId = String(formData.get("formTemplateId") ?? "");
    await db.events.setIntakeForm(eventId, formId || null);
    revalidatePath(`/o/${orgId}/e/${eventId}`);
  }

  async function setStage(formData: FormData) {
    "use server";
    const { userId } = await requireMembership(orgId);
    const db = createTenantClient(orgId, userId);
    const stageId = String(formData.get("stageId") ?? "");
    await db.events.setStage(eventId, stageId || null);
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

      <FieldCapture orgId={orgId} eventId={eventId} roster={entries} />

      {/* --- Photos --- */}
      <Card className="mt-8 p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-medium">Photos</h3>
          {photos.length > 0 ? <Badge>{photos.length}</Badge> : null}
        </div>
        <p className="mt-1 text-xs text-stone-400">
          Visible to participants who attended this event (and to your team).
        </p>
        {photosEnabled ? (
          <div className="mt-4 space-y-4">
            <PhotoUploader orgId={orgId} eventId={eventId} />
            {photoUrls.length > 0 ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {photoUrls.map((p) => (
                  <div key={p.id} className="group relative aspect-square">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt={p.caption ?? "Event photo"}
                      className="h-full w-full rounded-xl object-cover"
                      loading="lazy"
                    />
                    <form
                      action={deletePhoto}
                      className="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <input type="hidden" name="photoId" value={p.id} />
                      <button
                        aria-label="Delete photo"
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-sm text-white backdrop-blur transition-colors hover:bg-red-600"
                      >
                        ✕
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 rounded-xl bg-stone-50 p-3.5 text-sm text-stone-500 ring-1 ring-inset ring-stone-200">
            Photo storage isn&apos;t configured yet — set the R2 environment
            variables on Railway (see docs/DEPLOY.md).
          </p>
        )}
      </Card>

      {/* --- Registration settings --- */}
      <Card className="mt-8 p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-medium">Public registration</h3>
          <Badge>{event.publicRegistration ? "Open" : "Closed"}</Badge>
        </div>

        <form action={togglePublic} className="mt-3">
          <Button
            variant={event.publicRegistration ? "ghost" : "accent"}
            className="w-full"
          >
            {event.publicRegistration
              ? "Close public registration"
              : "Open public registration"}
          </Button>
        </form>

        {event.publicRegistration ? (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-medium text-stone-500">
              Share this link — anyone with it can register:
            </p>
            <CopyField value={publicUrl} />
          </div>
        ) : null}

        <div className="mt-5 border-t border-stone-100 pt-4">
          <h4 className="text-sm font-medium text-stone-700">Intake form</h4>
          <p className="mt-0.5 text-xs text-stone-400">
            Questions participants answer when they register.
          </p>
          <form action={setIntakeForm} className="mt-2 flex gap-2">
            <select
              name="formTemplateId"
              defaultValue={event.intakeForm?.id ?? ""}
              className="flex-1 rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-stone-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="">No intake form</option>
              {publishedForms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} (v{f.version})
                </option>
              ))}
            </select>
            <Button className="shrink-0">Save</Button>
          </form>
          {publishedForms.length === 0 ? (
            <p className="mt-2 text-xs text-stone-400">
              No published forms yet —{" "}
              <a href={`/o/${orgId}/forms`} className="underline hover:text-stone-600">
                create one
              </a>
              .
            </p>
          ) : null}
        </div>

        {allStages.length > 0 ? (
          <div className="mt-5 border-t border-stone-100 pt-4">
            <h4 className="text-sm font-medium text-stone-700">Program stage</h4>
            <p className="mt-0.5 text-xs text-stone-400">
              Attending this event marks that stage&apos;s requirement as met.
            </p>
            <form action={setStage} className="mt-2 flex gap-2">
              <select
                name="stageId"
                defaultValue={event.stageId ?? ""}
                className="flex-1 rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-stone-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value="">Not linked to a stage</option>
                {allStages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.program.name} — {s.name}
                  </option>
                ))}
              </select>
              <Button className="shrink-0">Save</Button>
            </form>
          </div>
        ) : null}
      </Card>
    </PageShell>
  );
}
