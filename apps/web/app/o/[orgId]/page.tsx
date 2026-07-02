import { createTenantClient, prisma } from "@convene/db";
import { createEventSchema } from "@convene/schemas";
import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/session";
import { formatDateTime } from "@/lib/format";
import { BackLink, Badge, Button, Card, Input, PageShell } from "@/components/ui";

export default async function OrgHome({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const { userId } = await requireMembership(orgId);

  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  const db = createTenantClient(orgId, userId);
  const events = await db.events.list();

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

  return (
    <PageShell>
      <BackLink href="/dashboard">All organizations</BackLink>
      <div className="mt-3 flex items-center justify-between gap-3">
        <h1 className="min-w-0 truncate text-2xl font-bold tracking-tight">
          {org?.name}
        </h1>
        <a
          href={`/o/${orgId}/forms`}
          className="shrink-0 rounded-xl px-3 py-1.5 text-sm font-medium text-stone-500 transition-colors hover:bg-stone-900/5 hover:text-stone-900"
        >
          Intake forms →
        </a>
      </div>

      <h2 className="mt-8 text-lg font-semibold">Events</h2>

      <ul className="mt-3 space-y-3">
        {events.length === 0 ? (
          <li>
            <Card className="p-6 text-center text-stone-500">
              No events yet — create one below.
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

      <Card className="mt-8 p-5">
        <h3 className="font-medium">New event</h3>
        <form action={createEvent} className="mt-3 space-y-3">
          <Input name="title" required placeholder="Event title" />
          <Input name="location" placeholder="Location (optional)" />
          <label className="block text-sm text-stone-600">
            Starts at
            <Input name="startsAt" type="datetime-local" required className="mt-1" />
          </label>
          <Button className="w-full">Create event</Button>
        </form>
      </Card>
    </PageShell>
  );
}
