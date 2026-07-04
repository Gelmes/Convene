"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** Multi-file photo uploader — posts each file to the upload route, then refreshes. */
export function PhotoUploader({
  orgId,
  eventId,
}: {
  orgId: string;
  eventId: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError("");
    let done = 0;
    let failed = 0;

    for (const file of Array.from(files)) {
      setProgress(`Uploading ${done + failed + 1} of ${files.length}…`);
      const body = new FormData();
      body.append("file", file);
      try {
        const res = await fetch(`/api/o/${orgId}/e/${eventId}/photos`, {
          method: "POST",
          body,
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(data?.error ?? `upload failed (${res.status})`);
        }
        done++;
      } catch (err) {
        failed++;
        setError(err instanceof Error ? err.message : "Upload failed");
      }
    }

    setBusy(false);
    setProgress("");
    if (inputRef.current) inputRef.current.value = "";
    if (done > 0) router.refresh();
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => void onFiles(e.currentTarget.files)}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="w-full rounded-xl border-2 border-dashed border-stone-300 bg-stone-50/50 p-6 text-sm font-medium text-stone-500 transition-all duration-150 hover:border-emerald-400 hover:bg-emerald-50/40 hover:text-emerald-700 disabled:pointer-events-none disabled:opacity-60"
      >
        {busy ? progress : "＋ Add photos"}
      </button>
      {error ? (
        <p className="mt-2 text-xs text-red-600">Some uploads failed: {error}</p>
      ) : null}
    </div>
  );
}
