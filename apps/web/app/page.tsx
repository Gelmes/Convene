import { auth } from "@convene/auth";
import Link from "next/link";

export default async function Home() {
  const session = await auth();

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-3xl font-bold">Convene</h1>
      <p className="mt-2 text-neutral-600">
        Phase 0 — foundation is live. Multi-tenant orgs, auth, and the audited
        health-data seam are wired up.
      </p>

      <div className="mt-8">
        {session?.user ? (
          <Link
            href="/dashboard"
            className="inline-block rounded bg-black px-4 py-2 text-white"
          >
            Go to your dashboard →
          </Link>
        ) : (
          <Link
            href="/sign-in"
            className="inline-block rounded bg-black px-4 py-2 text-white"
          >
            Sign in →
          </Link>
        )}
      </div>
    </main>
  );
}
