"use client";

import { useRef } from "react";

/**
 * A "select any" checkbox group that can enforce "pick at least one".
 *
 * HTML has no native one-of-many for checkboxes, so we use the constraint API:
 * every box starts `required` (the browser blocks submit with its native
 * message), and as soon as one is checked we clear `required` on all of them so
 * the form submits. Uncheck them all and the requirement snaps back.
 */
export function CheckboxGroup({
  id,
  options,
  required,
}: {
  id: string;
  options: string[];
  required: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function sync() {
    if (!required) return;
    const boxes = Array.from(
      ref.current?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ??
        [],
    );
    const anyChecked = boxes.some((b) => b.checked);
    for (const b of boxes) {
      b.required = !anyChecked;
      // Clear a lingering native error once the group is satisfied.
      if (anyChecked) b.setCustomValidity("");
    }
  }

  return (
    <div ref={ref} className="mt-1.5 space-y-1.5" onChange={sync}>
      {options.map((opt) => (
        <label
          key={opt}
          className="flex items-center gap-2 text-sm font-normal text-stone-600"
        >
          <input
            type="checkbox"
            name={`q_${id}`}
            value={opt}
            required={required}
            className="h-4 w-4 border-stone-300 accent-emerald-600"
          />
          {opt}
        </label>
      ))}
    </div>
  );
}
