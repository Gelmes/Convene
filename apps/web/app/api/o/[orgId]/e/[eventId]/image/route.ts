import { randomUUID } from "node:crypto";
import { auth } from "@convene/auth";
import { createTenantClient, getMembershipRole } from "@convene/db";
import { NextResponse } from "next/server";
import { r2Configured, r2Delete, r2Put } from "@/lib/r2";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB source
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

/** Upload/replace an event cover image → processed cover + card thumbnail in R2. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgId: string; eventId: string }> },
) {
  const { orgId, eventId } = await params;

  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const role = await getMembershipRole(userId, orgId);
  if (!role) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!r2Configured()) {
    return NextResponse.json({ error: "image storage not configured" }, { status: 503 });
  }

  const db = createTenantClient(orgId, userId);
  const event = await db.events.get(eventId);
  if (!event) {
    return NextResponse.json({ error: "event not found" }, { status: 404 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no file" }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: "unsupported file type — use JPG, PNG, WebP or HEIC" },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "image too large (max 15 MB)" }, { status: 400 });
  }

  const original = Buffer.from(await file.arrayBuffer());
  const base = `${orgId}/events/${eventId}/${randomUUID()}`;
  const imageKey = `${base}.webp`;
  const imageThumbKey = `${base}.thumb.webp`;

  try {
    const sharp = (await import("sharp")).default;
    const [cover, thumb] = await Promise.all([
      sharp(original)
        .rotate()
        .resize(1280, 720, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer(),
      sharp(original)
        .rotate()
        .resize(600, 400, { fit: "cover", position: "attention" })
        .webp({ quality: 75 })
        .toBuffer(),
    ]);
    await Promise.all([
      r2Put(imageKey, toArrayBuffer(cover), "image/webp"),
      r2Put(imageThumbKey, toArrayBuffer(thumb), "image/webp"),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "image processing failed";
    console.error("event image upload:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Point the event at the new image; clean up the previous one.
  const oldKeys = await db.events.setImage(eventId, { imageKey, imageThumbKey });
  await Promise.all(oldKeys.map((k) => r2Delete(k).catch(() => {})));

  return NextResponse.json({ ok: true });
}

/** Remove the event's cover image. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ orgId: string; eventId: string }> },
) {
  const { orgId, eventId } = await params;
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!(await getMembershipRole(userId, orgId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const db = createTenantClient(orgId, userId);
  const oldKeys = await db.events.setImage(eventId, {
    imageKey: null,
    imageThumbKey: null,
  });
  await Promise.all(oldKeys.map((k) => r2Delete(k).catch(() => {})));
  return NextResponse.json({ ok: true });
}
