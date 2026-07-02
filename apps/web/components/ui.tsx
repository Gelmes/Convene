import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from "react";

/*
 * Minimal shared UI kit. Server-component friendly (no client hooks) so it can
 * be used inside server actions/forms everywhere. Swap for shadcn/ui when the
 * app grows interactive.
 */

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium " +
  "transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-emerald-500/60 focus-visible:ring-offset-2 " +
  "active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none";

const buttonVariants = {
  primary:
    "bg-stone-900 text-white shadow-sm hover:bg-stone-700 hover:shadow-md",
  accent:
    "bg-emerald-600 text-white shadow-sm hover:bg-emerald-500 hover:shadow-md",
  ghost: "text-stone-500 hover:text-stone-900 hover:bg-stone-900/5",
} as const;

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof buttonVariants;
}) {
  return (
    <button
      className={cx(buttonBase, buttonVariants[variant], "px-4 py-2.5", className)}
      {...props}
    />
  );
}

export function LinkButton({
  variant = "primary",
  className,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: keyof typeof buttonVariants;
}) {
  return (
    <a
      className={cx(buttonBase, buttonVariants[variant], "px-4 py-2.5", className)}
      {...props}
    />
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        "w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5",
        "text-stone-900 shadow-sm transition-all duration-150",
        "hover:border-stone-300",
        "focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20",
        className,
      )}
      {...props}
    />
  );
}

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        "rounded-2xl border border-stone-200/80 bg-white/90 shadow-sm backdrop-blur",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageShell({
  children,
  width = "max-w-2xl",
}: {
  children: ReactNode;
  width?: string;
}) {
  return (
    <main className={cx("mx-auto px-4 py-8 sm:px-6 sm:py-12 animate-rise", width)}>
      {children}
    </main>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-600 ring-1 ring-inset ring-stone-200">
      {children}
    </span>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1 text-sm text-stone-500 transition-colors hover:text-stone-900"
    >
      <span aria-hidden>←</span> {children}
    </a>
  );
}

/** Wordmark used across screens. */
export function Brand({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2", className)}>
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900 text-sm font-bold text-white">
        C
      </span>
      <span className="text-lg font-semibold tracking-tight">Convene</span>
    </span>
  );
}
