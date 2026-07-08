import { prisma } from "./client";

/**
 * Plan-limit enforcement. Limits live in Plan.limits (JSON) in OUR database —
 * never in the payment provider — so they're adjustable with a SQL update and
 * enforced even when billing isn't configured. An org with planId null is on
 * the free tier.
 */

export type LimitedResource = "events" | "participants" | "programs" | "forms";

/** Fallback if the free Plan row is somehow missing. Mirrors the seed. */
export const FREE_LIMITS: Record<LimitedResource, number> = {
  events: 3,
  participants: 50,
  programs: 1,
  forms: 3,
};

export class LimitError extends Error {
  constructor(
    public readonly resource: LimitedResource,
    public readonly limit: number,
  ) {
    super(
      `Free plan limit reached (${limit} ${resource}). Upgrade to Pro for unlimited ${resource}.`,
    );
    this.name = "LimitError";
  }
}

async function getLimits(
  organizationId: string,
): Promise<Partial<Record<LimitedResource, number>>> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { plan: { select: { limits: true } } },
  });
  if (org?.plan) {
    return (org.plan.limits ?? {}) as Partial<Record<LimitedResource, number>>;
  }
  // No plan row linked → free tier.
  const free = await prisma.plan.findUnique({
    where: { id: "free" },
    select: { limits: true },
  });
  return ((free?.limits ?? FREE_LIMITS) ?? {}) as Partial<
    Record<LimitedResource, number>
  >;
}

function countResource(
  organizationId: string,
  resource: LimitedResource,
): Promise<number> {
  switch (resource) {
    case "events":
      return prisma.event.count({ where: { organizationId } });
    case "participants":
      return prisma.participant.count({ where: { organizationId } });
    case "programs":
      return prisma.program.count({ where: { organizationId } });
    case "forms":
      return prisma.formTemplate.count({ where: { organizationId } });
  }
}

/** Throws LimitError when creating one more `resource` would exceed the plan. */
export async function assertWithinLimit(
  organizationId: string,
  resource: LimitedResource,
): Promise<void> {
  const limits = await getLimits(organizationId);
  const limit = limits[resource];
  if (limit == null) return; // unlimited
  const count = await countResource(organizationId, resource);
  if (count >= limit) throw new LimitError(resource, limit);
}

/** Usage + limits for the billing UI. `limit: null` = unlimited. */
export async function getUsage(organizationId: string): Promise<
  Array<{ resource: LimitedResource; used: number; limit: number | null }>
> {
  const limits = await getLimits(organizationId);
  const resources: LimitedResource[] = [
    "events",
    "participants",
    "programs",
    "forms",
  ];
  return Promise.all(
    resources.map(async (resource) => ({
      resource,
      used: await countResource(organizationId, resource),
      limit: limits[resource] ?? null,
    })),
  );
}
