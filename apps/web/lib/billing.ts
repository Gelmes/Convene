import Stripe from "stripe";
import { prisma } from "@convene/db";

/**
 * Stripe adapter — the only file that talks to Stripe directly. Our database
 * (Plan/Subscription/Organization.planId) stays the source of truth; Stripe is
 * reached through checkout/portal sessions and updates us via webhooks.
 *
 * Prices are passed inline (price_data) so no products need to be configured
 * in the Stripe dashboard — only STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.
 */

export const PRO_PRICES = {
  monthly: { unitAmount: 2900, interval: "month" as const, label: "$29/month" },
  yearly: { unitAmount: 29000, interval: "year" as const, label: "$290/year (2 months free)" },
};
export type BillingInterval = keyof typeof PRO_PRICES;

export function billingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

function stripe(): Stripe {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

function origin(): string {
  return (process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Start a Pro subscription checkout; returns the Stripe-hosted URL. */
export async function createCheckoutUrl(
  organizationId: string,
  interval: BillingInterval,
  customerEmail?: string | null,
): Promise<string> {
  const price = PRO_PRICES[interval];
  const existing = await prisma.subscription.findUnique({
    where: { organizationId },
    select: { providerCustomerId: true },
  });

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    ...(existing?.providerCustomerId
      ? { customer: existing.providerCustomerId }
      : customerEmail
        ? { customer_email: customerEmail }
        : {}),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: price.unitAmount,
          recurring: { interval: price.interval },
          product_data: {
            name: "Vitalgather Pro",
            description: "Unlimited events, participants, programs, and forms",
          },
        },
      },
    ],
    subscription_data: { metadata: { organizationId } },
    metadata: { organizationId },
    success_url: `${origin()}/o/${organizationId}?billing=success`,
    cancel_url: `${origin()}/o/${organizationId}?billing=canceled`,
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

/** Stripe-hosted customer portal (cancel, invoices, payment method). */
export async function createPortalUrl(organizationId: string): Promise<string> {
  const sub = await prisma.subscription.findUnique({
    where: { organizationId },
    select: { providerCustomerId: true },
  });
  if (!sub?.providerCustomerId) {
    throw new Error("No billing customer for this organization");
  }
  const session = await stripe().billingPortal.sessions.create({
    customer: sub.providerCustomerId,
    return_url: `${origin()}/o/${organizationId}`,
  });
  return session.url;
}

/** Verify + parse a webhook payload. Throws on bad signature. */
export function parseWebhookEvent(rawBody: string, signature: string): Stripe.Event {
  return Stripe.webhooks.constructEvent(
    rawBody,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET!,
  );
}

/** Apply a Stripe event to OUR tables (the source of truth). */
export async function applyWebhookEvent(event: Stripe.Event): Promise<string> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const organizationId = session.metadata?.organizationId;
      if (!organizationId) return "ignored: no organizationId metadata";
      const customerId =
        typeof session.customer === "string" ? session.customer : session.customer?.id;
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;

      await prisma.$transaction([
        prisma.subscription.upsert({
          where: { organizationId },
          create: {
            organizationId,
            planId: "pro",
            provider: "stripe",
            providerCustomerId: customerId ?? null,
            providerSubscriptionId: subscriptionId ?? null,
            status: "active",
          },
          update: {
            planId: "pro",
            providerCustomerId: customerId ?? null,
            providerSubscriptionId: subscriptionId ?? null,
            status: "active",
          },
        }),
        prisma.organization.update({
          where: { id: organizationId },
          data: { planId: "pro" },
        }),
      ]);
      return `upgraded org ${organizationId} to pro`;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object;
      const organizationId = sub.metadata?.organizationId;
      const existing = organizationId
        ? { organizationId }
        : await prisma.subscription.findUnique({
            where: { providerSubscriptionId: sub.id },
            select: { organizationId: true },
          });
      if (!existing?.organizationId) return "ignored: unknown subscription";

      const active = sub.status === "active" || sub.status === "trialing";
      const periodEnd = sub.items.data[0]?.current_period_end;
      await prisma.$transaction([
        prisma.subscription.update({
          where: { organizationId: existing.organizationId },
          data: {
            status: sub.status,
            currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
          },
        }),
        prisma.organization.update({
          where: { id: existing.organizationId },
          data: { planId: active ? "pro" : "free" },
        }),
      ]);
      return `subscription ${sub.status} for org ${existing.organizationId}`;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const record = await prisma.subscription.findUnique({
        where: { providerSubscriptionId: sub.id },
        select: { organizationId: true },
      });
      if (!record) return "ignored: unknown subscription";
      await prisma.$transaction([
        prisma.subscription.update({
          where: { organizationId: record.organizationId },
          data: { status: "canceled" },
        }),
        prisma.organization.update({
          where: { id: record.organizationId },
          data: { planId: "free" },
        }),
      ]);
      return `downgraded org ${record.organizationId} to free`;
    }

    default:
      return `ignored: ${event.type}`;
  }
}
