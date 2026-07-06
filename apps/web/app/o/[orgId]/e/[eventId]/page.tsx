import { createTenantClient } from "@convene/db";
import { updateEventSchema } from "@convene/schemas";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { formatDateTime, toDateTimeLocalValue } from "@/lib/format";
import { r2Configured, r2Delete, r2PresignGet } from "@/lib/r2";
import {
  BackLink,
  Badge,
  Button,
  Card,
  Input,
  PageShell,
  Select,
  TabBar,
  Textarea,
} from "@/components/ui";
import { ConfirmButton } from "@/components/confirm";
import { SaveButton } from "@/components/save-button";
import { CopyField } from "@/components/copy-field";
import { FieldCapture, type RosterEntry } from "@/components/field-capture";
import { PhotoUploader } from "@/components/photo-uploader";

export default async function EventDetail({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string; eventId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { orgId, eventId } = await params;
  const sp = await searchParams;
  const tab =
    sp.tab === "photos" || sp.tab === "settings" ? sp.tab : "participants";
  const { userId } = await requireMembership(orgId);

  const db = createTenantClient(orgId, userId);
  const photosEnabled = r2Configured();

  // Independent queries — one parallel batch instead of six sequential trips.
  const [event, roster, readings, publishedForms, allStages, photos] =
    await Promise.all([
      db.events.get(eventId),
      db.registrations.listForEvent(eventId),
      db.healthReadings.listForEvent(eventId),
      db.forms.listPublished(),
      db.programs.listAllStages(),
      photosEnabled ? db.photos.listForEvent(eventId) : Promise.resolve([]),
    ]);
  if (!event) redirect(`/o/${orgId}`);

  const origin = process.env.AUTH_URL ?? "http://localhost:3000";
  const publicUrl = `${origin.replace(/\/$/, "")}/r/${eventId}`;
  // Presigning is only needed when the Photos tab is actually shown.
  const photoUrls =
    tab === "photos"
      ? await Promise.all(
          photos.map(async (p) => ({
            ...p,
            url: await r2PresignGet(p.storageKey),
            // Grids load the small webp; clicking opens the full original.
            thumbUrl: await r2PresignGet(p.thumbKey ?? p.storageKey),
          })),
        )
      : [];

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
      status: reg.status,
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
    if (photo) {
      await r2Delete(photo.storageKey).catch(() => {});
      if (photo.thumbKey) await r2Delete(photo.thumbKey).catch(() => {});
    }
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

  async function updateEvent(formData: FormData) {
    "use server";
    const { userId, role } = await requireMembership(orgId);
    if (role !== "OWNER" && role !== "ADMIN") return;
    const parsed = updateEventSchema.safeParse({
      title: formData.get("title"),
      description: (formData.get("description") as string)?.trim() || undefined,
      location: (formData.get("location") as string)?.trim() || undefined,
      startsAt: formData.get("startsAt"),
    });
    if (!parsed.success) return;
    const db = createTenantClient(orgId, userId);
    await db.events.update(eventId, parsed.data);
    revalidatePath(`/o/${orgId}/e/${eventId}`);
  }

  async function deleteEvent() {
    "use server";
    const { userId, role } = await requireMembership(orgId);
    if (role !== "OWNER" && role !== "ADMIN") return;
    const db = createTenantClient(orgId, userId);
    const storageKeys = await db.events.delete(eventId);
    await Promise.all(storageKeys.map((key) => r2Delete(key).catch(() => {})));
    redirect(`/o/${orgId}`);
  }

  const base = `/o/${orgId}/e/${eventId}`;

  return (
    <PageShell width="max-w-xl">
      <BackLink href={`/o/${orgId}`}>Events</BackLink>
      <h1 className="mt-3 text-2xl font-bold tracking-tight">{event.title}</h1>
      <p className="mt-1 text-sm text-stone-500">
        {formatDateTime(event.startsAt)}
        {event.location ? ` · ${event.location}` : ""}
      </p>

      <TabBar
        base={base}
        active={tab}
        tabs={[
          {
            key: "participants",
            label: `Participants${roster.length ? ` (${roster.length})` : ""}`,
          },
          { key: "photos", label: `Photos${photos.length ? ` (${photos.length})` : ""}` },
          { key: "settings", label: "Settings" },
        ]}
      />

      {tab === "participants" ? (
        <FieldCapture orgId={orgId} eventId={eventId} roster={entries} />
      ) : null}

      {tab === "photos" ? (
      <Card className="mt-6 p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-medium">Photos</h3>
          <span className="flex items-center gap-2">
            {photos.length > 0 ? (
              <a
                href={`/api/o/${orgId}/e/${eventId}/photos/download`}
                className="rounded-xl px-2.5 py-1 text-xs font-medium text-stone-500 transition-colors hover:bg-stone-900/5 hover:text-stone-900"
              >
                ↓ Download all
              </a>
            ) : null}
            {photos.length > 0 ? <Badge>{photos.length}</Badge> : null}
          </span>
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
                    <a href={p.url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.thumbUrl}
                        alt={p.caption ?? "Event photo"}
                        className="h-full w-full rounded-xl object-cover"
                        loading="lazy"
                      />
                    </a>
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
      ) : null}

      {tab === "settings" ? (
      <>
      {/* --- Registration settings --- */}
      <Card className="mt-6 p-5">
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
            <Select
              name="formTemplateId"
              key={event.intakeForm?.id ?? "none"}
              defaultValue={event.intakeForm?.id ?? ""}
              className="flex-1"
            >
              <option value="">No intake form</option>
              {publishedForms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} (v{f.version})
                </option>
              ))}
            </Select>
            <SaveButton className="shrink-0">Save</SaveButton>
          </form>
          {publishedForms.length === 0 ? (
            <p className="mt-2 text-xs text-stone-400">
              No published forms yet —{" "}
              <Link href={`/o/${orgId}/forms`} className="underline hover:text-stone-600">
                create one
              </Link>
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
              <Select
                name="stageId"
                key={event.stageId ?? "none"}
                defaultValue={event.stageId ?? ""}
                className="flex-1"
              >
                <option value="">Not linked to a stage</option>
                {allStages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.program.name} — {s.name}
                  </option>
                ))}
              </Select>
              <SaveButton className="shrink-0">Save</SaveButton>
            </form>
          </div>
        ) : null}
      </Card>

      {/* --- Manage ------------------------------------------------------------ */}
      <Card className="mt-6 border-red-100 p-5">
        <h3 className="font-medium">Event details</h3>
        <form action={updateEvent} className="mt-3 space-y-3">
          <label className="block text-xs font-medium text-stone-500">
            Title
            <Input
              name="title"
              key={event.title}
              defaultValue={event.title}
              required
              className="mt-1"
            />
          </label>
          <label className="block text-xs font-medium text-stone-500">
            Description{" "}
            <span className="font-normal text-stone-400">
              (shown on the public registration page)
            </span>
            <Textarea
              name="description"
              key={event.description ?? "none"}
              defaultValue={event.description ?? ""}
              rows={3}
              placeholder="What participants should know…"
              className="mt-1 text-sm"
            />
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="block flex-1 text-xs font-medium text-stone-500">
              Location
              <Input
                name="location"
                key={event.location ?? "none"}
                defaultValue={event.location ?? ""}
                placeholder="Location"
                className="mt-1"
              />
            </label>
            <label className="block flex-1 text-xs font-medium text-stone-500">
              Starts at
              <Input
                name="startsAt"
                type="datetime-local"
                key={event.startsAt.toISOString()}
                defaultValue={toDateTimeLocalValue(event.startsAt)}
                required
                className="mt-1"
              />
            </label>
          </div>
          <SaveButton className="w-full">Save changes</SaveButton>
        </form>
        <form action={deleteEvent} className="mt-3 border-t border-stone-100 pt-3">
          <ConfirmButton
            message={`Delete “${event.title}”? This permanently removes its ${roster.length} registration${roster.length === 1 ? "" : "s"} and ${photos.length} photo${photos.length === 1 ? "" : "s"}. Blood-pressure readings, intake submissions, and the participants themselves are KEPT — they just lose the link to this event.`}
            className="w-full text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            Delete event…
          </ConfirmButton>
        </form>
      </Card>
      </>
      ) : null}
    </PageShell>
  );
}
