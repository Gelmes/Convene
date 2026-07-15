import { prisma } from "./client";

/**
 * Team membership management (Slice 1 of authorized coordinators).
 *
 * Membership is opt-in: inviting someone creates an INVITED membership that
 * grants nothing (see getMembershipRole) until they sign in and accept, so
 * being added never exposes anyone to spam. Only OWNER/ADMIN can invite or
 * manage members, and this slice manages ADMIN/FACILITATOR rows only — OWNER
 * rows are read-only here (ownership/transfer is a later feature), which keeps
 * the "never zero owners" invariant trivially safe.
 */

export type ManageableRole = "ADMIN" | "FACILITATOR";
export type MemberRole = "OWNER" | "ADMIN" | "FACILITATOR" | "STAFF";

export interface OrgMember {
  membershipId: string;
  userId: string;
  name: string | null;
  email: string;
  role: MemberRole;
  status: "ACTIVE" | "INVITED" | "DISABLED";
  isSelf: boolean;
}

export interface PendingInvite {
  organizationId: string;
  organizationName: string;
  role: MemberRole;
}

/** True if the role may manage the org (config, events, members). */
export function canManageOrg(role: MemberRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

async function assertManager(orgId: string, actorUserId: string): Promise<MemberRole> {
  const m = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId: actorUserId, organizationId: orgId } },
    select: { role: true, status: true },
  });
  if (!m || m.status !== "ACTIVE" || !canManageOrg(m.role)) {
    throw new Error("Not authorized to manage members");
  }
  return m.role;
}

/** Members of an org (any status), for the OWNER/ADMIN team panel. */
export async function listMembers(
  orgId: string,
  actorUserId: string,
): Promise<OrgMember[]> {
  await assertManager(orgId, actorUserId);
  const rows = await prisma.membership.findMany({
    where: { organizationId: orgId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((m) => ({
    membershipId: m.id,
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    role: m.role,
    status: m.status,
    isSelf: m.userId === actorUserId,
  }));
}

export type InviteResult =
  | { status: "invited" | "reinvited"; email: string }
  | { status: "already-member" | "already-owner"; email: string };

/**
 * Invite someone to the org by email as ADMIN or FACILITATOR. Creates a shell
 * User if they've never signed in (magic-link sign-in links to it by email),
 * plus an INVITED membership that stays inert until they accept.
 */
export async function inviteMember(
  orgId: string,
  actorUserId: string,
  email: string,
  role: ManageableRole,
): Promise<InviteResult> {
  await assertManager(orgId, actorUserId);
  const normalized = email.trim().toLowerCase();

  const user = await prisma.user.upsert({
    where: { email: normalized },
    create: { email: normalized },
    update: {},
    select: { id: true },
  });

  const existing = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId: user.id, organizationId: orgId } },
    select: { id: true, role: true, status: true },
  });

  if (existing?.status === "ACTIVE") {
    return {
      status: existing.role === "OWNER" ? "already-owner" : "already-member",
      email: normalized,
    };
  }

  if (existing) {
    // Re-invite / change the pending (or previously disabled) row's role.
    await prisma.membership.update({
      where: { id: existing.id },
      data: { role, status: "INVITED" },
    });
  } else {
    await prisma.membership.create({
      data: { userId: user.id, organizationId: orgId, role, status: "INVITED" },
    });
  }

  await prisma.auditLog.create({
    data: {
      organizationId: orgId,
      actorUserId,
      action: "member.invite",
      entityType: "Membership",
      entityId: user.id,
      metadata: { email: normalized, role },
    },
  });

  return { status: existing ? "reinvited" : "invited", email: normalized };
}

/** Change an ADMIN/FACILITATOR member's role. OWNER rows are immutable here. */
export async function setMemberRole(
  orgId: string,
  actorUserId: string,
  membershipId: string,
  role: ManageableRole,
): Promise<void> {
  await assertManager(orgId, actorUserId);
  const target = await prisma.membership.findFirst({
    where: { id: membershipId, organizationId: orgId },
    select: { role: true },
  });
  if (!target) throw new Error("Member not found");
  if (target.role === "OWNER") throw new Error("Owners can't be changed here");

  await prisma.membership.update({ where: { id: membershipId }, data: { role } });
  await prisma.auditLog.create({
    data: {
      organizationId: orgId,
      actorUserId,
      action: "member.setRole",
      entityType: "Membership",
      entityId: membershipId,
      metadata: { role },
    },
  });
}

/** Remove an ADMIN/FACILITATOR member (pending or active). OWNERs are safe. */
export async function removeMember(
  orgId: string,
  actorUserId: string,
  membershipId: string,
): Promise<void> {
  await assertManager(orgId, actorUserId);
  const target = await prisma.membership.findFirst({
    where: { id: membershipId, organizationId: orgId },
    select: { role: true },
  });
  if (!target) throw new Error("Member not found");
  if (target.role === "OWNER") throw new Error("Owners can't be removed here");

  await prisma.membership.delete({ where: { id: membershipId } });
  await prisma.auditLog.create({
    data: {
      organizationId: orgId,
      actorUserId,
      action: "member.remove",
      entityType: "Membership",
      entityId: membershipId,
      metadata: {},
    },
  });
}

// --- User-scoped: pending invites the signed-in user has received ------------

export async function listPendingInvitesForUser(
  userId: string,
): Promise<PendingInvite[]> {
  const rows = await prisma.membership.findMany({
    where: { userId, status: "INVITED" },
    include: { organization: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((m) => ({
    organizationId: m.organization.id,
    organizationName: m.organization.name,
    role: m.role,
  }));
}

/** Accept a pending invite: flip the caller's own INVITED membership to ACTIVE. */
export async function acceptOrgInvite(userId: string, orgId: string): Promise<void> {
  const res = await prisma.membership.updateMany({
    where: { userId, organizationId: orgId, status: "INVITED" },
    data: { status: "ACTIVE" },
  });
  if (res.count > 0) {
    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        actorUserId: userId,
        action: "member.accept",
        entityType: "Membership",
        entityId: userId,
        metadata: {},
      },
    });
  }
}

/** Decline a pending invite: delete the caller's own INVITED membership. */
export async function declineOrgInvite(userId: string, orgId: string): Promise<void> {
  await prisma.membership.deleteMany({
    where: { userId, organizationId: orgId, status: "INVITED" },
  });
}
