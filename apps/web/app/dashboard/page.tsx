import { randomUUID } from "node:crypto";
import { auth, signOut } from "@convene/auth";
import { prisma } from "@convene/db";
import { createOrganizationSchema } from "@convene/schemas";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { slugify } from "@/lib/slug";

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
    <main className="mx-auto max-w-2xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your organizations</h1>
        <form action={doSignOut}>
          <button className="text-sm text-neutral-500 underline">Sign out</button>
        </form>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        Signed in as {session?.user?.email}
      </p>

      <ul className="mt-6 space-y-2">
        {memberships.length === 0 ? (
          <li className="text-neutral-500">
            No organizations yet — create your first one below.
          </li>
        ) : (
          memberships.map((m) => (
            <li key={m.id}>
              <a
                href={`/o/${m.organizationId}`}
                className="flex items-center justify-between rounded border border-neutral-200 bg-white p-3 hover:border-neutral-400"
              >
                <span className="font-medium">{m.organization.name}</span>
                <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                  {m.role}
                </span>
              </a>
            </li>
          ))
        )}
      </ul>

      <form action={createOrg} className="mt-8 flex gap-2">
        <input
          name="name"
          required
          placeholder="New organization name"
          className="flex-1 rounded border border-neutral-300 p-2"
        />
        <button className="rounded bg-black px-4 py-2 text-white">Create</button>
      </form>
    </main>
  );
}
