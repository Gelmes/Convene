"use client";

import { useState } from "react";
import { Button, Input } from "@/components/ui";

/** Read-only field with a copy button — for share links. */
export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex gap-2">
      <Input
        readOnly
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        className="text-sm text-stone-600"
      />
      <Button
        type="button"
        variant={copied ? "accent" : "primary"}
        className="shrink-0 px-3 py-1.5 text-sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            // Clipboard can be unavailable (http, permissions) — field is selectable.
          }
        }}
      >
        {copied ? "Copied ✓" : "Copy"}
      </Button>
    </div>
  );
}
