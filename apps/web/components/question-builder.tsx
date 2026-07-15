"use client";

import { useRef, useState } from "react";
import { Button, Card, Input, Select, Textarea } from "@/components/ui";

const TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "text", label: "Short answer" },
  { value: "textarea", label: "Paragraph" },
  { value: "number", label: "Number" },
  { value: "radio", label: "Multiple choice (pick one)" },
  { value: "checkboxes", label: "Checkboxes (pick any)" },
  { value: "select", label: "Dropdown" },
  { value: "checkbox", label: "Yes / No" },
  { value: "agreement", label: "Agreement / waiver" },
];

const OPTION_TYPES = new Set(["select", "radio", "checkboxes"]);

/**
 * Unified add-question form. Type is chosen first; the fields below morph to
 * match — an editable options list for choice types, or agreement text + a
 * document upload for agreements. Submits to the passed server action.
 */
export function QuestionBuilder({
  orgId,
  formId,
  action,
}: {
  orgId: string;
  formId: string;
  action: (formData: FormData) => Promise<void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState("text");
  const [options, setOptions] = useState<string[]>(["", ""]);

  // Agreement document upload state
  const [docKey, setDocKey] = useState("");
  const [docName, setDocName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const isOptions = OPTION_TYPES.has(type);
  const isAgreement = type === "agreement";

  function reset() {
    setType("text");
    setOptions(["", ""]);
    setDocKey("");
    setDocName("");
    setUploadError("");
    if (fileRef.current) fileRef.current.value = "";
    formRef.current?.reset();
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setUploadError("");
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
      setUploadError(err instanceof Error ? err.message : "upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card className="p-4">
      <form
        ref={formRef}
        action={async (fd) => {
          await action(fd);
          reset();
        }}
        className="space-y-3"
      >
        {/* Type first — everything below reacts to it */}
        <label className="block text-xs font-medium text-stone-500">
          Question type
          <Select
            name="type"
            value={type}
            onChange={(e) => setType(e.currentTarget.value)}
            className="mt-1 w-full"
          >
            {TYPE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </label>

        <Input
          name="label"
          required
          placeholder={
            isAgreement
              ? "Agreement title, e.g. Liability Waiver"
              : "Question, e.g. Any medical conditions?"
          }
        />

        {/* Choice types: editable options list (poll-style) */}
        {isOptions ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-stone-500">Options</p>
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  name="option"
                  value={opt}
                  onChange={(e) => {
                    const next = [...options];
                    next[i] = e.currentTarget.value;
                    setOptions(next);
                  }}
                  placeholder={`Option ${i + 1}`}
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => setOptions(options.filter((_, j) => j !== i))}
                  disabled={options.length <= 1}
                  aria-label="Remove option"
                  className="shrink-0 rounded-lg px-2 py-1.5 text-stone-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:pointer-events-none disabled:opacity-30"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setOptions([...options, ""])}
              className="text-sm font-medium text-emerald-700 hover:text-emerald-800"
            >
              + Add option
            </button>
          </div>
        ) : null}

        {/* Agreement: text + optional document */}
        {isAgreement ? (
          <>
            <Textarea
              name="agreementText"
              rows={4}
              placeholder="Paste your agreement text here (optional if you upload a document)"
              className="text-sm"
            />
            <input type="hidden" name="documentKey" value={docKey} />
            <input type="hidden" name="documentName" value={docName} />
            <input
              ref={fileRef}
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
                    if (fileRef.current) fileRef.current.value = "";
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
                onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-stone-300 bg-stone-50/50 text-stone-500 hover:border-emerald-400 hover:text-emerald-700"
              >
                {uploading ? "Uploading…" : "📎 Attach a document (PDF/image, optional)"}
              </Button>
            )}
            {uploadError ? (
              <p className="text-xs text-red-600">{uploadError}</p>
            ) : null}
          </>
        ) : null}

        {/* Required toggle — agreements are always required */}
        {isAgreement ? (
          <input type="hidden" name="required" value="on" />
        ) : (
          <label className="flex items-center gap-2 text-sm text-stone-600">
            <input
              type="checkbox"
              name="required"
              className="h-4 w-4 rounded border-stone-300 accent-emerald-600"
            />
            Required
          </label>
        )}

        <Button type="submit" className="w-full">
          Add question
        </Button>
      </form>
    </Card>
  );
}
