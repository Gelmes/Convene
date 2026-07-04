"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface UploadItem {
  id: string;
  name: string;
  pct: number; // 0..100
  status: "uploading" | "done" | "error";
  message?: string;
}

/**
 * Multi-file photo uploader with per-file progress bars. Uses XHR because
 * fetch() cannot observe upload progress.
 */
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
  const [items, setItems] = useState<UploadItem[]>([]);

  function patchItem(id: string, patch: Partial<UploadItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function uploadOne(file: File, onProgress: (pct: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/o/${orgId}/e/${eventId}/photos`);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          let message = `upload failed (${xhr.status})`;
          try {
            const data = JSON.parse(xhr.responseText) as { error?: string };
            if (data.error) message = data.error;
          } catch {
            // keep the generic message
          }
          reject(new Error(message));
        }
      };
      xhr.onerror = () => reject(new Error("network error — check your connection"));
      xhr.onabort = () => reject(new Error("upload cancelled"));

      const body = new FormData();
      body.append("file", file);
      xhr.send(body);
    });
  }

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);

    const queue = Array.from(files).map((file) => ({
      file,
      item: {
        id: crypto.randomUUID(),
        name: file.name,
        pct: 0,
        status: "uploading" as const,
      },
    }));
    setItems(queue.map((q) => q.item));

    let anyDone = false;
    for (const { file, item } of queue) {
      try {
        await uploadOne(file, (pct) => patchItem(item.id, { pct }));
        patchItem(item.id, { pct: 100, status: "done" });
        anyDone = true;
      } catch (err) {
        patchItem(item.id, {
          status: "error",
          message: err instanceof Error ? err.message : "upload failed",
        });
      }
    }

    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (anyDone) {
      router.refresh();
      // Keep failed rows visible; clear the finished ones shortly after the
      // gallery refresh brings the new photos in.
      setTimeout(() => {
        setItems((prev) => prev.filter((it) => it.status === "error"));
      }, 1200);
    }
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
        {busy ? "Uploading…" : "＋ Add photos"}
      </button>

      {items.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {items.map((it) => (
            <li key={it.id} className="text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate font-medium text-stone-600">
                  {it.name}
                </span>
                <span
                  className={
                    it.status === "error"
                      ? "shrink-0 font-semibold text-red-600"
                      : it.status === "done"
                        ? "shrink-0 font-semibold text-emerald-600"
                        : "shrink-0 tabular-nums text-stone-400"
                  }
                >
                  {it.status === "done" ? "✓" : it.status === "error" ? "✗" : `${it.pct}%`}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100">
                <div
                  className={`h-full rounded-full transition-[width] duration-200 ease-out ${
                    it.status === "error" ? "bg-red-400" : "bg-emerald-500"
                  }`}
                  style={{ width: `${it.status === "error" ? 100 : it.pct}%` }}
                />
              </div>
              {it.message ? (
                <p className="mt-1 text-red-600">{it.message}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
