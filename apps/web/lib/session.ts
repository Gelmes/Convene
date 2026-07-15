import { auth } from "@convene/auth";
import { getMembershipRole } from "@convene/db";
import { redirect } from "next/navigation";

/** Returns the signed-in user's id, or redirects to sign-in. */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/sign-in");
  return userId;
}

/**
 * Ensures the signed-in user is a member of the org. Redirects to /dashboard if
 * not a member. Returns the user id and their role.
 */
export async function requireMembership(organizationId: string): Promise<{
  userId: string;
  role: "OWNER" | "ADMIN" | "FACILITATOR" | "STAFF";
}> {
  const userId = await requireUserId();
  const role = await getMembershipRole(userId, organizationId);
  if (!role) redirect("/dashboard");
  return { userId, role };
}

/**
 * Like requireMembership, but also requires org-management rights (OWNER/ADMIN).
 * FACILITATOR/STAFF can run events but not configure the org — use this to guard
 * every management mutation (create/edit/delete events, programs, forms,
 * settings, members). Bounces non-managers back to the org home.
 */
export async function requireManage(organizationId: string): Promise<{
  userId: string;
  role: "OWNER" | "ADMIN" | "FACILITATOR" | "STAFF";
}> {
  const membership = await requireMembership(organizationId);
  if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
    redirect(`/o/${organizationId}`);
  }
  return membership;
}
