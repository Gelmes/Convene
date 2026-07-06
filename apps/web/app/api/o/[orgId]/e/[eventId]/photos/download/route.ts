import { PassThrough, Readable } from "node:stream";
import { ZipArchive } from "archiver";
import { auth } from "@convene/auth";
import { getMembershipRole, prisma } from "@convene/db";
import { NextResponse } from "next/server";
import { r2Configured, r2PresignGet } from "@/lib/r2";

/**
 * Download every photo of an event as one zip (originals, stored uncompressed —
 * JPEG/WebP don't shrink further, so this streams fast).
 *
 * Access: org members get all photos; a signed-in participant registered to
 * the event gets PUBLIC + PARTICIPANTS photos only.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgId: string; eventId: string }> },
) {
  const { orgId, eventId } = await params;

  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!r2Configured()) {
    return NextResponse.json({ error: "photo storage not configured" }, { status: 503 });
  }

  const event = await prisma.event.findFirst({
    where: { id: eventId, organizationId: orgId },
    select: { id: true, title: true },
  });
  if (!event) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Host member → everything; registered participant → visible photos only.
  const role = await getMembershipRole(userId, orgId);
  let visibility: Array<"PUBLIC" | "PARTICIPANTS" | "PRIVATE"> | null = null;
  if (role) {
    visibility = ["PUBLIC", "PARTICIPANTS", "PRIVATE"];
  } else {
    const registered = await prisma.eventRegistration.findFirst({
      where: {
        organizationId: orgId,
        eventId,
        participant: { userId },
      },
      select: { id: true },
    });
    if (!registered) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    visibility = ["PUBLIC", "PARTICIPANTS"];
  }

  const photos = await prisma.photo.findMany({
    where: { organizationId: orgId, eventId, visibility: { in: visibility } },
    orderBy: { createdAt: "asc" },
    select: { storageKey: true },
  });
  if (photos.length === 0) {
    return NextResponse.json({ error: "no photos" }, { status: 404 });
  }

  const zip = new ZipArchive({ store: true });
  const out = new PassThrough();
  zip.pipe(out);

  // Feed the archive in the background while the response streams.
  void (async () => {
    try {
      for (const [i, photo] of photos.entries()) {
        const key = photo.storageKey;
        const url = await r2PresignGet(key);
        const res = await fetch(url);
        if (!res.ok) continue;
        const ext = key.includes(".") ? key.slice(key.lastIndexOf(".")) : "";
        zip.append(Buffer.from(await res.arrayBuffer()), {
          name: `photo-${String(i + 1).padStart(3, "0")}${ext}`,
        });
      }
      await zip.finalize();
    } catch (err) {
      console.error("zip stream failed:", err);
      out.destroy(err instanceof Error ? err : new Error("zip failed"));
    }
  })();

  const safeTitle =
    event.title.replace(/[^a-zA-Z0-9 _-]/g, "").trim().replace(/\s+/g, "-") ||
    "event";

  return new Response(Readable.toWeb(out) as unknown as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeTitle}-photos.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
