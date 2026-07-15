import { createTenantClient } from "@convene/db";
import {
  eventVisibilitySchema,
  paymentSettingsSchema,
  updateEventSchema,
} from "@convene/schemas";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { formatDateTime, toDateTimeLocalValue, wallClockToUtc } from "@/lib/format";
import { TimezoneSelect } from "@/components/timezone-select";
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
import { EventImageUploader } from "@/components/event-image-uploader";

const VISIBILITY_OPTIONS = [
  {
    value: "CLOSED",
    label: "Closed",
    badge: "Closed",
    hint: "No public page — only your team can add participants.",
  },
  {
    value: "UNLISTED",
    label: "Link-only",
    badge: "Link-only",
    hint: "Anyone with the link below can register. Not shown in the public directory.",
  },
  {
    value: "LISTED",
    label: "In directory",
    badge: "In directory",
    hint: "Registerable via the link AND surfaced in the public event directory.",
  },
] as const;

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
  const coverUrl =
    photosEnabled && event.imageKey
      ? await r2PresignGet(event.imageKey)
      : undefined;
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
      paid: Boolean(reg.paidAt),
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

  async function setVisibility(formData: FormData) {
    "use server";
    const { userId } = await requireMembership(orgId);
    const parsed = eventVisibilitySchema.safeParse(formData.get("visibility"));
    if (!parsed.success) return;
    const db = createTenantClient(orgId, userId);
    await db.events.setVisibility(eventId, parsed.data);
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

  async function setPayment(formData: FormData) {
    "use server";
    const { userId } = await requireMembership(orgId);
    const parsed = paymentSettingsSchema.safeParse({
      price: (formData.get("price") as string) || undefined,
      paymentLink: (formData.get("paymentLink") as string)?.trim() || "",
      paymentInstructions:
        (formData.get("paymentInstructions") as string)?.trim() || undefined,
    });
    if (!parsed.success) return;
    const db = createTenantClient(orgId, userId);
    await db.events.setPayment(eventId, {
      priceCents:
        parsed.data.price && parsed.data.price > 0
          ? Math.round(parsed.data.price * 100)
          : null,
      paymentLink: parsed.data.paymentLink || null,
      paymentInstructions: parsed.data.paymentInstructions ?? null,
    });
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
      timezone: formData.get("timezone"),
    });
    if (!parsed.success) return;
    const db = createTenantClient(orgId, userId);
    await db.events.update(eventId, {
      title: parsed.data.title,
      description: parsed.data.description,
      location: parsed.data.location,
      startsAt: wallClockToUtc(parsed.data.startsAt, parsed.data.timezone),
      timezone: parsed.data.timezone,
    });
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
        {formatDateTime(event.startsAt, event.timezone)}
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
        <FieldCapture
          orgId={orgId}
          eventId={eventId}
          roster={entries}
          priced={Boolean(event.priceCents)}
        />
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
      {/* --- Cover image --- */}
      <Card className="mt-6 p-5">
        <h3 className="font-medium">Cover image</h3>
        <p className="mt-1 text-xs text-stone-400">
          Shown on the public registration page and in the event directory.
        </p>
        <div className="mt-3">
          {photosEnabled ? (
            <EventImageUploader
              orgId={orgId}
              eventId={eventId}
              currentUrl={coverUrl}
            />
          ) : (
            <p className="rounded-xl bg-stone-50 p-3 text-sm text-stone-500 ring-1 ring-inset ring-stone-200">
              Image storage isn&apos;t configured — set the R2 environment
              variables on Railway.
            </p>
          )}
        </div>
      </Card>

      {/* --- Registration settings --- */}
      <Card className="mt-6 p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-medium">Public registration</h3>
          <Badge>
            {VISIBILITY_OPTIONS.find((o) => o.value === event.visibility)?.badge ??
              "Closed"}
          </Badge>
        </div>

        <form
          action={setVisibility}
          className="mt-3 grid grid-cols-3 gap-1 rounded-2xl bg-stone-200/50 p-1"
        >
          {VISIBILITY_OPTIONS.map((o) => {
            const active = event.visibility === o.value;
            return (
              <button
                key={o.value}
                name="visibility"
                value={o.value}
                aria-current={active ? "true" : undefined}
                className={`rounded-xl px-2 py-2 text-center text-sm font-medium transition-all duration-150 ${
                  active
                    ? "bg-white text-stone-900 shadow-sm"
                    : "text-stone-500 hover:text-stone-800"
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </form>
        <p className="mt-2 text-xs text-stone-400">
          {VISIBILITY_OPTIONS.find((o) => o.value === event.visibility)?.hint}
        </p>

        {event.visibility !== "CLOSED" ? (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-medium text-stone-500">
              Share this link — anyone with it can register:
            </p>
            <CopyField value={publicUrl} />
            {event.visibility === "LISTED" ? (
              <p className="text-xs text-emerald-700">
                Also live in the{" "}
                <Link href="/discover" className="underline hover:text-emerald-800">
                  public directory
                </Link>
                .
              </p>
            ) : null}
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

      {/* --- Payment (Mode A: host's own channel, we track) --------------------- */}
      <Card className="mt-6 p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-medium">Payment</h3>
          <Badge>
            {event.priceCents
              ? `$${(event.priceCents / 100).toFixed(2).replace(/\.00$/, "")}`
              : "Free"}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-stone-400">
          You collect payment through your own channel (Venmo, PayPal, cash…) —
          Vitalgather shows participants how to pay and tracks who has.
        </p>
        <form action={setPayment} className="mt-3 space-y-3">
          <label className="block text-xs font-medium text-stone-500">
            Price in USD (leave empty for a free event)
            <Input
              name="price"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              key={event.priceCents ?? "free"}
              defaultValue={event.priceCents ? (event.priceCents / 100).toString() : ""}
              placeholder="e.g. 45"
              className="mt-1"
            />
          </label>
          <label className="block text-xs font-medium text-stone-500">
            Payment link (optional)
            <Input
              name="paymentLink"
              type="url"
              key={event.paymentLink ?? "none"}
              defaultValue={event.paymentLink ?? ""}
              placeholder="https://venmo.com/u/yourname"
              className="mt-1"
            />
          </label>
          <label className="block text-xs font-medium text-stone-500">
            Payment instructions (optional)
            <Textarea
              name="paymentInstructions"
              rows={2}
              key={event.paymentInstructions ?? "none"}
              defaultValue={event.paymentInstructions ?? ""}
              placeholder="e.g. Venmo @yourname — include your full name in the note"
              className="mt-1 text-sm"
            />
          </label>
          <SaveButton className="w-full">Save payment settings</SaveButton>
        </form>
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
                defaultValue={toDateTimeLocalValue(event.startsAt, event.timezone)}
                required
                className="mt-1"
              />
            </label>
          </div>
          <label className="block text-xs font-medium text-stone-500">
            Timezone{" "}
            <span className="font-normal text-stone-400">
              (the event happens in this zone)
            </span>
            <TimezoneSelect
              name="timezone"
              key={event.timezone}
              defaultValue={event.timezone}
            />
          </label>
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
