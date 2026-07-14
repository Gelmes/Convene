"use client";

import { useRef, useState } from "react";
import { Button, Card, Input, Textarea } from "@/components/ui";

/**
 * Add-agreement form for the builder. Uploads an optional document to R2 first
 * (returning a storage key), then submits the agreement question via the passed
 * server action with the key/name stashed in hidden fields.
 */
export function AgreementBuilder({
  orgId,
  formId,
  action,
}: {
  orgId: string;
  formId: string;
  action: (formData: FormData) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [docKey, setDocKey] = useState("");
  const [docName, setDocName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/o/${orgId}/forms/${formId}/document`, {
        method: "POST",
        body,
      });
      const data = (await res.json().catch(() => null)) as
        | { key?: string; name?: string; error?: string }
        | null;
      if (!res.ok || !data?.key) {
        throw new Error(data?.error ?? `upload failed (${res.status})`);
      }
      setDocKey(data.key);
      setDocName(data.name ?? file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card className="p-4">
      <form action={action} className="space-y-3">
        <Input name="label" required placeholder="Agreement title, e.g. Liability Waiver" />
        <Textarea
          name="agreementText"
          rows={4}
          placeholder="Paste your agreement text here (optional if you upload a document)"
          className="text-sm"
        />

        <input type="hidden" name="documentKey" value={docKey} />
        <input type="hidden" name="documentName" value={docName} />
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => void onFile(e.currentTarget.files?.[0])}
        />

        {docName ? (
          <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-600/10">
            <span className="truncate">📄 {docName}</span>
            <button
              type="button"
              onClick={() => {
                setDocKey("");
                setDocName("");
                if (inputRef.current) inputRef.current.value = "";
              }}
              className="ml-2 shrink-0 text-xs font-medium text-emerald-700 underline"
            >
              Remove
            </button>
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="w-full border-2 border-dashed border-stone-300 bg-stone-50/50 text-stone-500 hover:border-emerald-400 hover:text-emerald-700"
          >
            {uploading ? "Uploading…" : "📎 Attach a document (PDF/image, optional)"}
          </Button>
        )}
        {error ? <p className="text-xs text-red-600">{error}</p> : null}

        <p className="text-xs text-stone-400">
          Participants see the text and/or document, then must check
          &ldquo;I have read and agree&rdquo; to register. Acceptance is recorded
          with a timestamp and the form version.
        </p>
        <Button type="submit" className="w-full">
          Add agreement
        </Button>
      </form>
    </Card>
  );
}
