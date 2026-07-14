import { randomUUID } from "node:crypto";
import { auth } from "@convene/auth";
import { createTenantClient, getMembershipRole } from "@convene/db";
import { NextResponse } from "next/server";
import { r2Configured, r2Put } from "@/lib/r2";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per document
const ALLOWED = new Map<string, string>([
  ["application/pdf", "pdf"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

/**
 * Host uploads an agreement document (waiver PDF/image) for a form. Proxied to
 * R2 like photos; returns the storage key + display name, which the builder
 * stashes into the agreement question definition.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgId: string; formId: string }> },
) {
  const { orgId, formId } = await params;

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
      { error: "document storage not configured" },
      { status: 503 },
    );
  }

  // Confirm the form belongs to this org before accepting an upload.
  const db = createTenantClient(orgId, userId);
  const form = await db.forms.get(formId);
  if (!form) {
    return NextResponse.json({ error: "form not found" }, { status: 404 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no file" }, { status: 400 });
  }
  const ext = ALLOWED.get(file.type);
  if (!ext) {
    return NextResponse.json(
      { error: "unsupported file type — use PDF, JPG, PNG or WebP" },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file too large (max 10 MB)" }, { status: 400 });
  }

  const key = `${orgId}/forms/${formId}/${randomUUID()}.${ext}`;
  try {
    await r2Put(key, await file.arrayBuffer(), file.type);
  } catch (err) {
    const message = err instanceof Error ? err.message : "storage upload failed";
    console.error("agreement document upload:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json({ key, name: file.name.slice(0, 200) });
}
