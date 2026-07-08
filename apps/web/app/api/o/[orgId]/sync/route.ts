import { auth } from "@convene/auth";
import { createTenantClient, getMembershipRole } from "@convene/db";
import { syncBatchSchema } from "@convene/schemas";
import { NextResponse } from "next/server";

/**
 * Offline-sync endpoint. Receives a batch of ops from a device's outbox and
 * applies them idempotently (client-generated UUIDs), so a retried batch never
 * duplicates participants or readings.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await params;

  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const role = await getMembershipRole(userId, orgId);
  if (!role) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = syncBatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid batch", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const db = createTenantClient(orgId, userId);
  const results: Array<{ id: string; status: "done" | "error"; message?: string }> =
    [];

  // Ops are applied in order — participant ops precede the readings that
  // reference them because the outbox enqueues them that way.
  for (const op of parsed.data.ops) {
    try {
      if (op.kind === "participant") {
        await db.registrations.addNewParticipant(
          op.eventId,
          { firstName: op.firstName, lastName: op.lastName },
          op.id,
        );
      } else if (op.kind === "checkin") {
        await db.registrations.checkIn(op.eventId, op.participantId);
      } else if (op.kind === "paid") {
        await db.registrations.setPaid(op.eventId, op.participantId, op.paid);
      } else {
        await db.healthReadings.create({
          id: op.id,
          eventId: op.eventId,
          participantId: op.participantId,
          systolic: op.systolic,
          diastolic: op.diastolic,
          pulse: op.pulse,
          note: op.note,
          takenAt: op.takenAt,
        });
      }
      results.push({ id: op.id, status: "done" });
    } catch (err) {
      results.push({
        id: op.id,
        status: "error",
        message: err instanceof Error ? err.message : "unknown error",
      });
    }
  }

  return NextResponse.json({ results });
}
