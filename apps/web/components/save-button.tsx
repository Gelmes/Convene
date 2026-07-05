"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";

/**
 * Submit button for server-action forms that shows its lifecycle:
 * label → "Saving…" (disabled) → "Saved ✓" (briefly) → label.
 * Must be rendered INSIDE the <form> it submits (useFormStatus).
 */
export function SaveButton({
  children,
  variant = "primary",
  className,
  savedLabel = "Saved ✓",
}: {
  children: React.ReactNode;
  variant?: "primary" | "accent" | "ghost";
  className?: string;
  savedLabel?: string;
}) {
  const { pending } = useFormStatus();
  const [saved, setSaved] = useState(false);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending) {
      setSaved(true);
      const t = setTimeout(() => setSaved(false), 1800);
      return () => clearTimeout(t);
    }
    wasPending.current = pending;
  }, [pending]);

  return (
    <Button
      type="submit"
      variant={saved ? "accent" : variant}
      disabled={pending}
      className={className}
    >
      {pending ? "Saving…" : saved ? savedLabel : children}
    </Button>
  );
}
