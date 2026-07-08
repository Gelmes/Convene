import { NextResponse } from "next/server";
import { applyWebhookEvent, billingConfigured, parseWebhookEvent } from "@/lib/billing";

/**
 * Stripe → us. Signature-verified; the ONLY path that changes an org's plan.
 * Idempotent by construction (upserts + absolute states), so Stripe retries
 * are safe.
 */
export async function POST(req: Request) {
  if (!billingConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "billing not configured" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  let event;
  try {
    event = parseWebhookEvent(await req.text(), signature);
  } catch (err) {
    console.error("webhook signature verification failed:", err);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    const result = await applyWebhookEvent(event);
    console.log(`stripe webhook ${event.type}: ${result}`);
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error(`stripe webhook ${event.type} failed:`, err);
    // 500 → Stripe retries with backoff, which is what we want.
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
}
