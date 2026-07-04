import { randomUUID } from "node:crypto";
import { auth } from "@convene/auth";
import { createTenantClient, getMembershipRole } from "@convene/db";
import { NextResponse } from "next/server";
import { r2Configured, r2Put } from "@/lib/r2";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB per photo
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
]);

/** Host photo upload — proxied to R2 so the bucket needs no CORS config. */
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
    return NextResponse.json(
      { error: "photo storage not configured" },
      { status: 503 },
    );
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no file" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "unsupported file type" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file too large (max 15 MB)" }, { status: 400 });
  }

  const db = createTenantClient(orgId, userId);
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const storageKey = `${orgId}/${eventId}/${randomUUID()}.${ext}`;

  try {
    await r2Put(storageKey, await file.arrayBuffer(), file.type);
  } catch (err) {
    const message = err instanceof Error ? err.message : "storage upload failed";
    console.error("photo upload:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  try {
    const photo = await db.photos.create({
      eventId,
      storageKey,
      contentType: file.type,
      size: file.size,
    });
    return NextResponse.json({ id: photo.id });
  } catch (err) {
    // DB rejected (e.g. event not in this org) — don't leave an orphan object.
    const { r2Delete } = await import("@/lib/r2");
    await r2Delete(storageKey).catch(() => {});
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "upload failed" },
      { status: 400 },
    );
  }
}
