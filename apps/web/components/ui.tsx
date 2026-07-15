import Link from "next/link";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
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
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium " +
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
  href = "#",
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: keyof typeof buttonVariants;
}) {
  return (
    <Link
      href={href}
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

const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%2378716c' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E\")";

/**
 * Styled select: custom chevron (the native arrow ignores padding and hugs the
 * edge) and min-w-0 so it can shrink inside flex rows instead of overflowing
 * small screens.
 */
export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      style={{
        backgroundImage: CHEVRON,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 0.875rem center",
        backgroundSize: "1rem",
      }}
      className={cx(
        "min-w-0 appearance-none truncate rounded-xl border border-stone-200 bg-white py-2.5 pl-3.5 pr-10",
        "text-sm text-stone-900 shadow-sm transition-all duration-150",
        "hover:border-stone-300",
        "focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
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
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm text-stone-500 transition-colors hover:text-stone-900"
    >
      <span aria-hidden>←</span> {children}
    </Link>
  );
}

/**
 * Segmented tab bar driven by links (?tab=…) so server pages stay server pages.
 * The first tab is the default and links to the bare path.
 */
export function TabBar({
  base,
  active,
  tabs,
}: {
  base: string;
  active: string;
  tabs: Array<{ key: string; label: ReactNode }>;
}) {
  return (
    <nav className="mt-6 flex gap-1 rounded-2xl bg-stone-200/50 p-1">
      {tabs.map((t, i) => (
        <Link
          key={t.key}
          href={i === 0 ? base : `${base}?tab=${t.key}`}
          aria-current={active === t.key ? "page" : undefined}
          className={cx(
            "flex-1 whitespace-nowrap rounded-xl px-2 py-2 text-center text-sm font-medium transition-all duration-150 sm:px-3",
            active === t.key
              ? "bg-white text-stone-900 shadow-sm"
              : "text-stone-500 hover:text-stone-800",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** Wordmark used across screens. */
export function Brand({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/vitalgather-logo.svg" alt="" className="h-7 w-auto" />
      <span className="text-lg font-semibold tracking-tight">Vitalgather</span>
    </span>
  );
}
