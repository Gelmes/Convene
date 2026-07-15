"use client";

import { useState } from "react";

/**
 * Participant-facing agreement. Shows the terms + optional document, then a
 * required "I have read and agree" checkbox. When there's a document, the
 * checkbox stays disabled until the participant opens it at least once.
 */
export function AgreementField({
  id,
  label,
  agreementText,
  documentUrl,
  documentName,
}: {
  id: string;
  label: string;
  agreementText?: string;
  documentUrl?: string;
  documentName?: string;
}) {
  const [opened, setOpened] = useState(false);
  const mustOpen = Boolean(documentUrl);
  const locked = mustOpen && !opened;

  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-4">
      <p className="text-sm font-semibold text-stone-800">{label}</p>

      {agreementText ? (
        <div className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-stone-200 bg-white p-3 text-xs leading-relaxed text-stone-600">
          {agreementText}
        </div>
      ) : null}

      {documentUrl ? (
        <a
          href={documentUrl}
          target="_blank"
          rel="noreferrer"
          onClick={() => setOpened(true)}
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-800"
        >
          📄 View {documentName ?? "document"} ↗
        </a>
      ) : null}

      <label
        className={`mt-3 flex items-center gap-2 text-sm font-medium ${
          locked ? "text-stone-400" : "text-stone-700"
        }`}
      >
        <input
          type="checkbox"
          name={`q_${id}`}
          required
          disabled={locked}
          className="h-4 w-4 rounded border-stone-300 accent-emerald-600 disabled:opacity-50"
        />
        I have read and agree
        <span className="text-red-500">*</span>
      </label>
      {locked ? (
        <p className="mt-1 text-xs text-amber-600">
          Please open the document above to continue.
        </p>
      ) : null}
    </div>
  );
}
