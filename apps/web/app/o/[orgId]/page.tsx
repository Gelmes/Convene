import { createTenantClient, prisma } from "@convene/db";
import { createEventSchema } from "@convene/schemas";
import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/session";
import { formatDateTime } from "@/lib/format";

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
    <main className="mx-auto max-w-2xl p-6">
      <a href="/dashboard" className="text-sm text-neutral-500 underline">
        ← All organizations
      </a>
      <h1 className="mt-2 text-2xl font-bold">{org?.name}</h1>
      <h2 className="mt-6 text-lg font-semibold">Events</h2>

      <ul className="mt-3 space-y-2">
        {events.length === 0 ? (
          <li className="text-neutral-500">No events yet — create one below.</li>
        ) : (
          events.map((e) => (
            <li key={e.id}>
              <a
                href={`/o/${orgId}/e/${e.id}`}
                className="flex items-center justify-between rounded border border-neutral-200 bg-white p-3 hover:border-neutral-400"
              >
                <span>
                  <span className="font-medium">{e.title}</span>
                  <span className="ml-2 text-sm text-neutral-500">
                    {formatDateTime(e.startsAt)}
                  </span>
                </span>
                <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                  {e._count.registrations} ppl
                </span>
              </a>
            </li>
          ))
        )}
      </ul>

      <form
        action={createEvent}
        className="mt-8 space-y-3 rounded border border-neutral-200 bg-white p-4"
      >
        <h3 className="font-medium">New event</h3>
        <input
          name="title"
          required
          placeholder="Event title"
          className="w-full rounded border border-neutral-300 p-2"
        />
        <input
          name="location"
          placeholder="Location (optional)"
          className="w-full rounded border border-neutral-300 p-2"
        />
        <label className="block text-sm text-neutral-600">
          Starts at
          <input
            name="startsAt"
            type="datetime-local"
            required
            className="mt-1 w-full rounded border border-neutral-300 p-2"
          />
        </label>
        <button className="w-full rounded bg-black p-2 text-white">
          Create event
        </button>
      </form>
    </main>
  );
}
