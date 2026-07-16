import {
  createTenantClient,
  getUsage,
  inviteMember,
  LimitError,
  listMembers,
  prisma,
  removeMember,
  setMemberRole,
} from "@convene/db";
import {
  createEventSchema,
  createSessionSchema,
  inviteMemberSchema,
  renameSchema,
} from "@convene/schemas";
import { sendMemberInviteEmail } from "@/lib/mailer";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { TimezoneSelect } from "@/components/timezone-select";
import { LocalTime } from "@/components/local-time";
import {
  billingConfigured,
  createCheckoutUrl,
  createPortalUrl,
  PRO_PRICES,
  type BillingInterval,
} from "@/lib/billing";
import { requireManage, requireMembership } from "@/lib/session";
import { formatDateTime, wallClockToUtc } from "@/lib/format";
import { BackLink, Badge, Button, Card, Input, PageShell, Select } from "@/components/ui";
import { ConfirmButton, TypedDeleteConfirm } from "@/components/confirm";
import { Rollout } from "@/components/rollout";
import { SaveButton } from "@/components/save-button";

export default async function OrgHome({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ billing?: string; limit?: string }>;
}) {
  const { orgId } = await params;
  const sp = await searchParams;
  const { userId, role } = await requireMembership(orgId);

  const db = createTenantClient(orgId, userId);
  const [org, events, usage] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        plan: { select: { id: true, name: true } },
        subscription: { select: { status: true, currentPeriodEnd: true } },
        _count: {
          select: { participants: true, events: true, healthReadings: true },
        },
      },
    }),
    db.events.list(),
    getUsage(orgId),
  ]);

  const isPro = org?.plan?.id === "pro";
  const canManage = role === "OWNER" || role === "ADMIN";
  const members = canManage ? await listMembers(orgId, userId) : [];

  // Presign event card thumbnails (small; only events that have one).
  const { r2Configured, r2PresignGet } = await import("@/lib/r2");
  const thumbEnabled = r2Configured();
  const eventThumbs = new Map<string, string>();
  if (thumbEnabled) {
    await Promise.all(
      events
        .filter((e) => e.imageThumbKey)
        .map(async (e) => {
          eventThumbs.set(e.id, await r2PresignGet(e.imageThumbKey!));
        }),
    );
  }

  async function createEvent(formData: FormData) {
    "use server";
    const { userId } = await requireManage(orgId);
    const parsed = createEventSchema.safeParse({
      title: formData.get("title"),
      location: formData.get("location") || undefined,
      startsAt: formData.get("startsAt"),
      timezone: formData.get("timezone"),
    });
    if (!parsed.success) return;
    const db = createTenantClient(orgId, userId);
    try {
      await db.events.create({
        title: parsed.data.title,
        location: parsed.data.location,
        startsAt: wallClockToUtc(parsed.data.startsAt, parsed.data.timezone),
        timezone: parsed.data.timezone,
      });
    } catch (err) {
      if (err instanceof LimitError) redirect(`/o/${orgId}?limit=events`);
      throw err;
    }
    revalidatePath(`/o/${orgId}`);
  }

  async function createSession(formData: FormData) {
    "use server";
    const { userId } = await requireManage(orgId);
    const parsed = createSessionSchema.safeParse({
      firstName: formData.get("firstName"),
      lastName: (formData.get("lastName") as string) || undefined,
      startsAt: formData.get("startsAt"),
      timezone: formData.get("timezone"),
    });
    if (!parsed.success) return;
    const db = createTenantClient(orgId, userId);
    let event;
    try {
      event = await db.events.createSession({
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        startsAt: wallClockToUtc(parsed.data.startsAt, parsed.data.timezone),
        timezone: parsed.data.timezone,
      });
    } catch (err) {
      if (err instanceof LimitError) redirect(`/o/${orgId}?limit=events`);
      throw err;
    }
    redirect(`/o/${orgId}/e/${event.id}`);
  }

  async function inviteMemberAction(formData: FormData) {
    "use server";
    const { userId } = await requireManage(orgId);
    const parsed = inviteMemberSchema.safeParse({
      email: formData.get("email"),
      role: formData.get("role"),
    });
    if (!parsed.success) return;
    const result = await inviteMember(orgId, userId, parsed.data.email, parsed.data.role);
    if (result.status === "invited" || result.status === "reinvited") {
      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { name: true },
      });
      const origin = process.env.AUTH_URL ?? "http://localhost:3000";
      await sendMemberInviteEmail({
        to: result.email,
        orgName: org?.name ?? "An organization",
        role: parsed.data.role,
        url: `${origin.replace(/\/$/, "")}/dashboard`,
      }).catch(() => {});
    }
    revalidatePath(`/o/${orgId}`);
  }

  async function setMemberRoleAction(formData: FormData) {
    "use server";
    const { userId } = await requireManage(orgId);
    const role = formData.get("role");
    if (role !== "ADMIN" && role !== "FACILITATOR") return;
    await setMemberRole(orgId, userId, String(formData.get("membershipId")), role);
    revalidatePath(`/o/${orgId}`);
  }

  async function removeMemberAction(formData: FormData) {
    "use server";
    const { userId } = await requireManage(orgId);
    await removeMember(orgId, userId, String(formData.get("membershipId")));
    revalidatePath(`/o/${orgId}`);
  }

  async function upgrade(formData: FormData) {
    "use server";
    const { userId, role } = await requireMembership(orgId);
    if (role !== "OWNER" && role !== "ADMIN") return;
    const interval: BillingInterval =
      formData.get("interval") === "yearly" ? "yearly" : "monthly";
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    const url = await createCheckoutUrl(orgId, interval, user?.email);
    redirect(url);
  }

  async function manageBilling() {
    "use server";
    const { role } = await requireMembership(orgId);
    if (role !== "OWNER" && role !== "ADMIN") return;
    const url = await createPortalUrl(orgId);
    redirect(url);
  }

  async function renameOrg(formData: FormData) {
    "use server";
    const { role } = await requireMembership(orgId);
    if (role !== "OWNER" && role !== "ADMIN") return;
    const parsed = renameSchema.safeParse({ name: formData.get("name") });
    if (!parsed.success) return;
    await prisma.organization.update({
      where: { id: orgId },
      data: { name: parsed.data.name },
    });
    revalidatePath(`/o/${orgId}`);
  }

  async function deleteOrg(formData: FormData) {
    "use server";
    const { role } = await requireMembership(orgId);
    if (role !== "OWNER") return;
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true },
    });
    // Server-side re-check of the typed confirmation — never trust the client.
    if (!org || formData.get("confirm") !== org.name) return;
    const photos = await prisma.photo.findMany({
      where: { organizationId: orgId },
      select: { storageKey: true, thumbKey: true },
    });
    await prisma.organization.delete({ where: { id: orgId } });
    const { r2Delete } = await import("@/lib/r2");
    const keys = photos.flatMap((p) => [
      p.storageKey,
      ...(p.thumbKey ? [p.thumbKey] : []),
    ]);
    await Promise.all(keys.map((key) => r2Delete(key).catch(() => {})));
    redirect("/dashboard");
  }

  const title = (
    <h1 className="min-w-0 truncate text-2xl font-bold tracking-tight">
      {org?.name}
    </h1>
  );

  return (
    <PageShell>
      <BackLink href="/dashboard">All organizations</BackLink>

      {sp.billing === "success" ? (
        <Card className="mt-4 border-emerald-200 bg-emerald-50/60 p-4 text-sm text-emerald-800">
          🎉 Welcome to <strong>Vitalgather Pro</strong> — everything is now
          unlimited. (It can take a few seconds for the plan badge below to
          update after checkout.)
        </Card>
      ) : null}
      {sp.billing === "canceled" ? (
        <Card className="mt-4 border-stone-200 bg-stone-50 p-4 text-sm text-stone-600">
          Checkout canceled — no charge was made.
        </Card>
      ) : null}
      {sp.limit ? (
        <Card className="mt-4 border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-800">
          You&apos;ve reached the Free plan&apos;s {sp.limit} limit.{" "}
          <strong>Upgrade to Pro below</strong> for unlimited everything.
        </Card>
      ) : null}

      <div className="mt-3">
        {canManage && org ? (
          <Rollout heading={title} label="Edit">
            <Card className="p-4">
              <form action={renameOrg} className="flex gap-2">
                <Input name="name" key={org.name} defaultValue={org.name} required />
                <SaveButton className="shrink-0" savedLabel="Renamed ✓">
                  Rename
                </SaveButton>
              </form>
              {role === "OWNER" ? (
                <div className="mt-4 border-t border-stone-100 pt-4">
                  <p className="text-sm font-medium text-red-700">
                    Delete organization
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-stone-500">
                    Permanently deletes <strong>everything</strong>:{" "}
                    {org._count.events} events, {org._count.participants}{" "}
                    participants, {org._count.healthReadings} health readings,
                    all forms, submissions, photos, programs, and invites. This
                    cannot be undone.
                  </p>
                  <form action={deleteOrg} className="mt-3">
                    <TypedDeleteConfirm
                      expected={org.name}
                      label="Delete this organization forever"
                    />
                  </form>
                </div>
              ) : null}
            </Card>
          </Rollout>
        ) : (
          title
        )}
        {canManage ? (
        <nav className="mt-2 flex gap-1">
          <Link
            href={`/o/${orgId}/programs`}
            className="rounded-xl px-2.5 py-1 text-sm font-medium text-stone-500 transition-colors hover:bg-stone-900/5 hover:text-stone-900"
          >
            Programs
          </Link>
          <Link
            href={`/o/${orgId}/forms`}
            className="rounded-xl px-2.5 py-1 text-sm font-medium text-stone-500 transition-colors hover:bg-stone-900/5 hover:text-stone-900"
          >
            Intake forms
          </Link>
        </nav>
        ) : null}
      </div>

      <div className="mt-8">
        {canManage ? (
        <>
        <Rollout
          heading={<h2 className="text-lg font-semibold">Events</h2>}
          label="+ Add event"
          accent
        >
          <Card className="p-4">
            <form action={createEvent} className="space-y-3">
              <Input name="title" required placeholder="Event title" />
              <Input name="location" placeholder="Location (optional)" />
              <div className="flex flex-col gap-3 sm:flex-row">
                <label className="block flex-1 text-sm text-stone-600">
                  Starts at
                  <Input
                    name="startsAt"
                    type="datetime-local"
                    required
                    className="mt-1"
                  />
                </label>
                <label className="block flex-1 text-sm text-stone-600">
                  Timezone
                  <TimezoneSelect name="timezone" />
                </label>
              </div>
              <SaveButton className="w-full" savedLabel="Event created ✓">
                Create event
              </SaveButton>
            </form>
          </Card>
        </Rollout>
        <Rollout
          heading={
            <span className="text-sm font-medium text-stone-500">
              Private 1-on-1?
            </span>
          }
          label="+ New 1:1 session"
        >
          <Card className="p-4">
            <form action={createSession} className="space-y-3">
              <div className="flex gap-2">
                <Input name="firstName" required placeholder="Client first name" />
                <Input name="lastName" placeholder="Last name (optional)" />
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <label className="block flex-1 text-sm text-stone-600">
                  When
                  <Input
                    name="startsAt"
                    type="datetime-local"
                    required
                    className="mt-1"
                  />
                </label>
                <label className="block flex-1 text-sm text-stone-600">
                  Timezone
                  <TimezoneSelect name="timezone" />
                </label>
              </div>
              <Button className="w-full">Create session</Button>
            </form>
            <p className="mt-2 text-xs text-stone-400">
              Creates a private session with this client and drops you into it to
              capture their reading. Not shown publicly.
            </p>
          </Card>
        </Rollout>
        </>
        ) : (
          <h2 className="text-lg font-semibold">Events</h2>
        )}

        <ul className="mt-3 space-y-3">
          {events.length === 0 ? (
            <li>
              <Card className="p-6 text-center text-stone-500">
                No events yet — tap “+ Add event” to create your first one.
              </Card>
            </li>
          ) : (
            events.map((e) => (
              <li key={e.id}>
                <Link href={`/o/${orgId}/e/${e.id}`} className="group block">
                  <Card className="flex items-center justify-between gap-3 p-4 transition-all duration-150 group-hover:-translate-y-0.5 group-hover:shadow-md">
                    {eventThumbs.has(e.id) ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={eventThumbs.get(e.id)}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-lg object-cover"
                      />
                    ) : null}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-stone-900">
                        {e.title}
                      </span>
                      <span className="mt-0.5 block text-sm text-stone-500">
                        {formatDateTime(e.startsAt, e.timezone)}
                        {e.location ? ` · ${e.location}` : ""}
                      </span>
                    </span>
                    <span className="ml-3 flex shrink-0 items-center gap-3">
                      <Badge>
                        {e.kind === "ONE_ON_ONE"
                          ? "1:1"
                          : `${e._count.registrations} ${
                              e._count.registrations === 1 ? "person" : "people"
                            }`}
                      </Badge>
                      <span
                        aria-hidden
                        className="text-stone-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-stone-500"
                      >
                        →
                      </span>
                    </span>
                  </Card>
                </Link>
              </li>
            ))
          )}
        </ul>
      </div>

      {/* --- Team --------------------------------------------------------------- */}
      {canManage ? (
        <Card className="mt-8 p-5">
          <h3 className="font-medium">Team</h3>
          <p className="mt-1 text-xs text-stone-400">
            Invite coordinators to help run events. Admins manage everything;
            facilitators run events (check-in, mark paid, log readings) but
            can&apos;t change org settings.
          </p>

          <ul className="mt-4 space-y-2">
            {members.map((m) => (
              <li
                key={m.membershipId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-100 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-stone-800">
                    {m.name ?? m.email}
                    {m.isSelf ? " (you)" : ""}
                  </p>
                  {m.name ? (
                    <p className="truncate text-xs text-stone-400">{m.email}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {m.status === "INVITED" ? <Badge>Invited</Badge> : null}
                  {m.role === "OWNER" || m.isSelf ? (
                    <Badge>{m.role}</Badge>
                  ) : (
                    <>
                      <form
                        action={setMemberRoleAction}
                        className="flex items-center gap-1"
                      >
                        <input type="hidden" name="membershipId" value={m.membershipId} />
                        <Select
                          name="role"
                          key={m.role}
                          defaultValue={m.role}
                          className="py-1.5 text-xs"
                        >
                          <option value="FACILITATOR">Facilitator</option>
                          <option value="ADMIN">Admin</option>
                        </Select>
                        <SaveButton
                          variant="ghost"
                          className="px-2 py-1 text-xs"
                          savedLabel="✓"
                        >
                          Save
                        </SaveButton>
                      </form>
                      <form action={removeMemberAction}>
                        <input type="hidden" name="membershipId" value={m.membershipId} />
                        <ConfirmButton
                          message={`Remove ${m.name ?? m.email} from the team? They lose access immediately.`}
                          className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                        >
                          Remove
                        </ConfirmButton>
                      </form>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <form
            action={inviteMemberAction}
            className="mt-4 flex flex-col gap-2 border-t border-stone-100 pt-4 sm:flex-row"
          >
            <Input
              name="email"
              type="email"
              required
              placeholder="teammate@email.com"
              className="flex-1"
            />
            <Select name="role" defaultValue="FACILITATOR" className="sm:w-40">
              <option value="FACILITATOR">Facilitator</option>
              <option value="ADMIN">Admin</option>
            </Select>
            <SaveButton className="shrink-0" savedLabel="Invited ✓">
              Invite
            </SaveButton>
          </form>
          <p className="mt-2 text-xs text-stone-400">
            They get nothing until they sign in with this email and accept from
            their dashboard — so invites can&apos;t be used to spam anyone.
          </p>
        </Card>
      ) : null}

      {/* --- Billing ------------------------------------------------------------ */}
      {canManage ? (
        <Card className="mt-8 p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-medium">Plan</h3>
            <Badge>
              {isPro
                ? `Pro${
                    org?.subscription?.status && org.subscription.status !== "active"
                      ? ` · ${org.subscription.status}`
                      : ""
                  }`
                : "Free"}
            </Badge>
          </div>

          <ul className="mt-3 space-y-2">
            {usage.map((u) => (
              <li key={u.resource} className="text-xs">
                <div className="flex items-center justify-between text-stone-600">
                  <span className="capitalize">{u.resource}</span>
                  <span className="tabular-nums">
                    {u.used} / {u.limit ?? "∞"}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100">
                  <div
                    className={`h-full rounded-full ${
                      u.limit != null && u.used >= u.limit
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                    }`}
                    style={{
                      width:
                        u.limit == null
                          ? "4%"
                          : `${Math.min(100, (u.used / u.limit) * 100)}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>

          {!billingConfigured() ? (
            <p className="mt-4 rounded-xl bg-stone-50 p-3 text-xs text-stone-500 ring-1 ring-inset ring-stone-200">
              Billing isn&apos;t configured yet — set the Stripe environment
              variables on Railway to enable upgrades.
            </p>
          ) : isPro ? (
            <form action={manageBilling} className="mt-4">
              <Button variant="ghost" className="w-full border border-stone-200">
                Manage billing (invoices, cancel)
              </Button>
              {org?.subscription?.currentPeriodEnd ? (
                <p className="mt-2 text-center text-xs text-stone-400">
                  Renews <LocalTime iso={org.subscription.currentPeriodEnd.toISOString()} />
                </p>
              ) : null}
            </form>
          ) : (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <form action={upgrade} className="flex-1">
                <input type="hidden" name="interval" value="monthly" />
                <Button variant="accent" className="w-full">
                  Go Pro — {PRO_PRICES.monthly.label}
                </Button>
              </form>
              <form action={upgrade} className="flex-1">
                <input type="hidden" name="interval" value="yearly" />
                <Button className="w-full">{PRO_PRICES.yearly.label}</Button>
              </form>
            </div>
          )}
        </Card>
      ) : null}
    </PageShell>
  );
}
