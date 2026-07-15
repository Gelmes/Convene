import { createTenantClient, LimitError, prisma } from "@convene/db";
import { createProgramSchema } from "@convene/schemas";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManage } from "@/lib/session";
import { BackLink, Badge, Button, Card, Input, PageShell } from "@/components/ui";
import { Rollout } from "@/components/rollout";

export default async function ProgramsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ limit?: string }>;
}) {
  const { orgId } = await params;
  const sp = await searchParams;
  const { userId } = await requireManage(orgId);

  const db = createTenantClient(orgId, userId);
  const [org, programs] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId } }),
    db.programs.list(),
  ]);

  async function createProgram(formData: FormData) {
    "use server";
    const { userId } = await requireManage(orgId);
    const parsed = createProgramSchema.safeParse({ name: formData.get("name") });
    if (!parsed.success) return;
    const db = createTenantClient(orgId, userId);
    try {
      await db.programs.create(parsed.data);
    } catch (err) {
      if (err instanceof LimitError) redirect(`/o/${orgId}/programs?limit=1`);
      throw err;
    }
    revalidatePath(`/o/${orgId}/programs`);
  }

  return (
    <PageShell>
      <BackLink href={`/o/${orgId}`}>{org?.name ?? "Organization"}</BackLink>
      {sp.limit ? (
        <Card className="mt-4 border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-800">
          You&apos;ve reached the Free plan&apos;s program limit.{" "}
          <Link href={`/o/${orgId}`} className="font-semibold underline">
            Upgrade to Pro
          </Link>{" "}
          for unlimited programs.
        </Card>
      ) : null}
      <div className="mt-3">
        <Rollout
          heading={
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold tracking-tight">Programs</h1>
              <p className="mt-1 text-sm text-stone-500">
                Multi-stage journeys you move participants through.
              </p>
            </div>
          }
          label="+ New program"
          accent
        >
          <Card className="p-4">
            <form action={createProgram} className="flex gap-2">
              <Input name="name" required placeholder="e.g. Breathwork Foundations" />
              <Button className="shrink-0">Create</Button>
            </form>
          </Card>
        </Rollout>
      </div>

      <ul className="mt-6 space-y-3">
        {programs.length === 0 ? (
          <li>
            <Card className="p-6 text-center text-stone-500">
              No programs yet — tap “+ New program” to create your first one.
            </Card>
          </li>
        ) : (
          programs.map((p) => (
            <li key={p.id}>
              <Link href={`/o/${orgId}/programs/${p.id}`} className="group block">
                <Card className="flex items-center justify-between p-4 transition-all duration-150 group-hover:-translate-y-0.5 group-hover:shadow-md">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-stone-900">
                      {p.name}
                    </span>
                    <span className="mt-0.5 block text-sm text-stone-500">
                      {p._count.stages} {p._count.stages === 1 ? "stage" : "stages"} ·{" "}
                      {p._count.enrollments} enrolled
                    </span>
                  </span>
                  <span className="ml-3 flex shrink-0 items-center gap-3">
                    <Badge>{p.status}</Badge>
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

    </PageShell>
  );
}
