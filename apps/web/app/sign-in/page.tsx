import { googleEnabled, signIn } from "@convene/auth";
import { signInSchema } from "@convene/schemas";
import Link from "next/link";
import { Brand, Button, Card, Input, PageShell } from "@/components/ui";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.16 3.57-8.81Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.93-2.91l-3.87-3c-1.07.72-2.44 1.14-4.06 1.14-3.12 0-5.77-2.1-6.71-4.94H1.28v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.29a7.21 7.21 0 0 1 0-4.58v-3.1H1.28a12 12 0 0 0 0 10.78l4.01-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.6 4.58 1.79l3.44-3.44A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.28 6.61l4.01 3.1C6.23 6.87 8.88 4.77 12 4.77Z"
      />
    </svg>
  );
}

export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ check?: string; error?: string; to?: string }>;
}) {
  const sp = await searchParams;
  // Only allow known internal destinations — never a raw user-supplied URL.
  const redirectTo = sp.to === "me" ? "/me" : "/dashboard";
  const withGoogle = googleEnabled();

  async function sendLink(formData: FormData) {
    "use server";
    const parsed = signInSchema.safeParse({ email: formData.get("email") });
    if (!parsed.success) return;
    await signIn("resend", {
      email: parsed.data.email,
      redirectTo,
    });
  }

  async function googleSignIn() {
    "use server";
    await signIn("google", { redirectTo });
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
          {withGoogle
            ? "Continue with Google, or get a sign-in link by email."
            : "Enter your email and we'll send you a sign-in link."}
        </p>

        {sp.error ? (
          <p className="mt-4 rounded-xl bg-red-50 p-3.5 text-sm leading-relaxed text-red-700 ring-1 ring-inset ring-red-600/10">
            Sign-in didn&apos;t complete — please try again. If it keeps
            happening, use the email link instead.
          </p>
        ) : null}

        {sp.check ? (
          <p className="mt-4 rounded-xl bg-emerald-50 p-3.5 text-sm leading-relaxed text-emerald-800 ring-1 ring-inset ring-emerald-600/10">
            Check your email for a magic link. In dev, the link is printed to
            the server console.
          </p>
        ) : null}

        {withGoogle ? (
          <>
            <form action={googleSignIn} className="mt-6">
              <Button
                type="submit"
                variant="ghost"
                className="w-full border border-stone-200 bg-white shadow-sm hover:border-stone-300 hover:bg-stone-50"
              >
                <GoogleIcon />
                Continue with Google
              </Button>
            </form>
            <div className="mt-5 flex items-center gap-3 text-xs text-stone-400">
              <span className="h-px flex-1 bg-stone-200" />
              or
              <span className="h-px flex-1 bg-stone-200" />
            </div>
          </>
        ) : null}

        <form action={sendLink} className={withGoogle ? "mt-5 space-y-3" : "mt-6 space-y-3"}>
          <Input
            name="email"
            type="email"
            required
            autoFocus={!withGoogle}
            placeholder="you@example.com"
          />
          <Button type="submit" className="w-full">
            Send magic link
          </Button>
        </form>
      </Card>

      <p className="mt-6 text-center text-xs text-stone-400">
        No password needed — both options sign you in securely.
      </p>
    </PageShell>
  );
}
