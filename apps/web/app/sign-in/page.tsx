import { signIn } from "@convene/auth";
import { signInSchema } from "@convene/schemas";
import Link from "next/link";
import { Brand, Button, Card, Input, PageShell } from "@/components/ui";

export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ check?: string; error?: string; to?: string }>;
}) {
  const sp = await searchParams;
  // Only allow known internal destinations — never a raw user-supplied URL.
  const redirectTo = sp.to === "me" ? "/me" : "/dashboard";

  async function sendLink(formData: FormData) {
    "use server";
    const parsed = signInSchema.safeParse({ email: formData.get("email") });
    if (!parsed.success) return;
    await signIn("resend", {
      email: parsed.data.email,
      redirectTo,
    });
  }

  return (
    <PageShell width="max-w-md">
      <div className="flex justify-center">
        <Link href="/">
          <Brand />
        </Link>
      </div>

      <Card className="mt-10 p-6 sm:p-8">
        <h1 className="text-xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-1 text-sm text-stone-500">
          Enter your email and we&apos;ll send you a sign-in link.
        </p>

        {sp.check ? (
          <p className="mt-4 rounded-xl bg-emerald-50 p-3.5 text-sm leading-relaxed text-emerald-800 ring-1 ring-inset ring-emerald-600/10">
            Check your email for a magic link. In dev, the link is printed to
            the server console.
          </p>
        ) : null}

        <form action={sendLink} className="mt-6 space-y-3">
          <Input
            name="email"
            type="email"
            required
            autoFocus
            placeholder="you@example.com"
          />
          <Button type="submit" className="w-full">
            Send magic link
          </Button>
        </form>
      </Card>

      <p className="mt-6 text-center text-xs text-stone-400">
        No password needed — the link signs you in.
      </p>
    </PageShell>
  );
}
