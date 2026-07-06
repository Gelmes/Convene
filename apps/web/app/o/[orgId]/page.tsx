import { createTenantClient, prisma } from "@convene/db";
import { createEventSchema, renameSchema } from "@convene/schemas";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { formatDateTime } from "@/lib/format";
import { BackLink, Badge, Button, Card, Input, PageShell } from "@/components/ui";
import { TypedDeleteConfirm } from "@/components/confirm";
import { Rollout } from "@/components/rollout";
import { SaveButton } from "@/components/save-button";

export default async function OrgHome({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const { userId, role } = await requireMembership(orgId);

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    include: {
      _count: { select: { participants: true, events: true, healthReadings: true } },
    },
  });
  const db = createTenantClient(orgId, userId);
  const events = await db.events.list();

  const canManage = role === "OWNER" || role === "ADMIN";

  async function createEvent(formData: FormData) {
    "use server";
    const { userId } = await requireMembership(orgId);
    const parsed = createEventSchema.safeParse({
      title: formData.get("title"),
      location: formData.get("location") || undefined,
      startsAt: formData.get("startsAt"),
    });
    if (!parsed.success) return;
    const db = createTenantClient(orgId, userId);
    await db.events.create(parsed.data);
    revalidatePath(`/o/${orgId}`);
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
        <nav className="mt-2 flex gap-1">
          <a
            href={`/o/${orgId}/programs`}
            className="rounded-xl px-2.5 py-1 text-sm font-medium text-stone-500 transition-colors hover:bg-stone-900/5 hover:text-stone-900"
          >
            Programs
          </a>
          <a
            href={`/o/${orgId}/forms`}
            className="rounded-xl px-2.5 py-1 text-sm font-medium text-stone-500 transition-colors hover:bg-stone-900/5 hover:text-stone-900"
          >
            Intake forms
          </a>
        </nav>
      </div>

      <div className="mt-8">
        <Rollout
          heading={<h2 className="text-lg font-semibold">Events</h2>}
          label="+ Add event"
          accent
        >
          <Card className="p-4">
            <form action={createEvent} className="space-y-3">
              <Input name="title" required placeholder="Event title" />
              <Input name="location" placeholder="Location (optional)" />
              <label className="block text-sm text-stone-600">
                Starts at
                <Input
                  name="startsAt"
                  type="datetime-local"
                  required
                  className="mt-1"
                />
              </label>
              <Button className="w-full">Create event</Button>
            </form>
          </Card>
        </Rollout>

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
                <a href={`/o/${orgId}/e/${e.id}`} className="group block">
                  <Card className="flex items-center justify-between p-4 transition-all duration-150 group-hover:-translate-y-0.5 group-hover:shadow-md">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-stone-900">
                        {e.title}
                      </span>
                      <span className="mt-0.5 block text-sm text-stone-500">
                        {formatDateTime(e.startsAt)}
                        {e.location ? ` · ${e.location}` : ""}
                      </span>
                    </span>
                    <span className="ml-3 flex shrink-0 items-center gap-3">
                      <Badge>
                        {e._count.registrations}{" "}
                        {e._count.registrations === 1 ? "person" : "people"}
                      </Badge>
                      <span
                        aria-hidden
                        className="text-stone-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-stone-500"
                      >
                        →
                      </span>
                    </span>
                  </Card>
                </a>
              </li>
            ))
          )}
        </ul>
      </div>
    </PageShell>
  );
}
