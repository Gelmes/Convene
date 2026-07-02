import { createTenantClient, prisma } from "@convene/db";
import { createFormTemplateSchema } from "@convene/schemas";
import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/session";
import { BackLink, Badge, Button, Card, Input, PageShell } from "@/components/ui";

export default async function FormsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const { userId } = await requireMembership(orgId);

  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  const db = createTenantClient(orgId, userId);
  const forms = await db.forms.list();

  async function createForm(formData: FormData) {
    "use server";
    const { userId } = await requireMembership(orgId);
    const parsed = createFormTemplateSchema.safeParse({
      name: formData.get("name"),
    });
    if (!parsed.success) return;
    const db = createTenantClient(orgId, userId);
    await db.forms.create(parsed.data);
    revalidatePath(`/o/${orgId}/forms`);
  }

  return (
    <PageShell>
      <BackLink href={`/o/${orgId}`}>{org?.name ?? "Organization"}</BackLink>
      <h1 className="mt-3 text-2xl font-bold tracking-tight">Intake forms</h1>
      <p className="mt-1 text-sm text-stone-500">
        Custom questions participants answer when they register.
      </p>

      <ul className="mt-6 space-y-3">
        {forms.length === 0 ? (
          <li>
            <Card className="p-6 text-center text-stone-500">
              No forms yet — create your first one below.
            </Card>
          </li>
        ) : (
          forms.map((f) => (
            <li key={f.id}>
              <a href={`/o/${orgId}/forms/${f.id}`} className="group block">
                <Card className="flex items-center justify-between p-4 transition-all duration-150 group-hover:-translate-y-0.5 group-hover:shadow-md">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-stone-900">
                      {f.name}
                    </span>
                    <span className="mt-0.5 block text-sm text-stone-500">
                      {f._count.submissions}{" "}
                      {f._count.submissions === 1 ? "submission" : "submissions"} · v
                      {f.version}
                    </span>
                  </span>
                  <span className="ml-3 flex shrink-0 items-center gap-3">
                    <Badge>{f.status}</Badge>
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
        <h3 className="font-medium">New form</h3>
        <form action={createForm} className="mt-3 flex gap-2">
          <Input name="name" required placeholder="e.g. Health intake" />
          <Button className="shrink-0">Create</Button>
        </form>
      </Card>
    </PageShell>
  );
}
