"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

/**
 * Cover-image control for an event: shows the current image (if any), uploads a
 * replacement, or removes it. Talks to /api/o/[orgId]/e/[eventId]/image.
 */
export function EventImageUploader({
  orgId,
  eventId,
  currentUrl,
}: {
  orgId: string;
  eventId: string;
  currentUrl?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endpoint = `/api/o/${orgId}/e/${eventId}/image`;

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(endpoint, { method: "POST", body });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `upload failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await fetch(endpoint, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void upload(e.currentTarget.files?.[0])}
      />
      {currentUrl ? (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentUrl}
            alt="Event cover"
            className="aspect-[16/9] w-full rounded-xl object-cover"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="flex-1 border border-stone-200"
            >
              {busy ? "Working…" : "Replace"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => void remove()}
              className="flex-1 border border-stone-200 text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="aspect-[16/9] w-full flex-col border-2 border-dashed border-stone-300 bg-stone-50/50 text-stone-500 hover:border-emerald-400 hover:text-emerald-700"
        >
          {busy ? "Uploading…" : "🖼️ Add a cover image"}
        </Button>
      )}
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
