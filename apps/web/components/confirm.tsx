"use client";

import { useState } from "react";
import { Button, Input } from "@/components/ui";

/** Submit button that asks for confirmation before letting the form post. */
export function ConfirmButton({
  message,
  children,
  className,
}: {
  message: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Button
      variant="ghost"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </Button>
  );
}

/**
 * Delete guard for the most destructive actions (organizations): the submit
 * button stays disabled until the user types the entity's exact name.
 */
export function TypedDeleteConfirm({
  expected,
  label,
}: {
  expected: string;
  label: string;
}) {
  const [value, setValue] = useState("");
  const match = value === expected;

  return (
    <div className="space-y-2">
      <Input
        name="confirm"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={`Type “${expected}” to confirm`}
      />
      <Button
        disabled={!match}
        className="w-full bg-red-600 text-white hover:bg-red-500 disabled:bg-stone-300"
      >
        {label}
      </Button>
    </div>
  );
}
