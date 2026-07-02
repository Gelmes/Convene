import { randomUUID } from "node:crypto";
import { auth, signOut } from "@convene/auth";
import { prisma } from "@convene/db";
import { createOrganizationSchema } from "@convene/schemas";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { slugify } from "@/lib/slug";
import { Badge, Brand, Button, Card, Input, PageShell } from "@/components/ui";

export default async function Dashboard() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/sign-in");

  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });

  async function createOrg(formData: FormData) {
    "use server";
    const session = await auth();
    const uid = (session?.user as { id?: string } | undefined)?.id;
    if (!uid) redirect("/sign-in");

    const parsed = createOrganizationSchema.safeParse({
      name: formData.get("name"),
    });
    if (!parsed.success) return;

    const slug = `${slugify(parsed.data.name)}-${randomUUID().slice(0, 6)}`;
    const org = await prisma.organization.create({
      data: { name: parsed.data.name, slug },
    });
    await prisma.membership.create({
      data: {
        userId: uid,
        organizationId: org.id,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    revalidatePath("/dashboard");
  }

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <PageShell>
      <div className="flex items-center justify-between">
        <a href="/">
          <Brand />
        </a>
        <form action={doSignOut}>
          <Button variant="ghost" className="px-3 py-1.5 text-sm">
            Sign out
          </Button>
        </form>
      </div>

      <div className="mt-10">
        <h1 className="text-2xl font-bold tracking-tight">Your organizations</h1>
        <p className="mt-1 text-sm text-stone-500">
          Signed in as {session?.user?.email}
        </p>
      </div>

      <ul className="mt-6 space-y-3">
        {memberships.length === 0 ? (
          <li>
            <Card className="p-6 text-center text-stone-500">
              No organizations yet — create your first one below.
            </Card>
          </li>
        ) : (
          memberships.map((m) => (
            <li key={m.id}>
              <a href={`/o/${m.organizationId}`} className="group block">
                <Card className="flex items-center justify-between p-4 transition-all duration-150 group-hover:-translate-y-0.5 group-hover:shadow-md">
                  <span className="font-medium text-stone-900">
                    {m.organization.name}
                  </span>
                  <span className="flex items-center gap-3">
                    <Badge>{m.role}</Badge>
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
        <h3 className="font-medium">New organization</h3>
        <form action={createOrg} className="mt-3 flex gap-2">
          <Input name="name" required placeholder="e.g. The Temple of Eden" />
          <Button className="shrink-0">Create</Button>
        </form>
      </Card>
    </PageShell>
  );
}
