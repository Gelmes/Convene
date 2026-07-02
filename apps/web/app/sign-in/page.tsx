import { signIn } from "@convene/auth";
import { signInSchema } from "@convene/schemas";

export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ check?: string; error?: string }>;
}) {
  const sp = await searchParams;

  async function sendLink(formData: FormData) {
    "use server";
    const parsed = signInSchema.safeParse({ email: formData.get("email") });
    if (!parsed.success) return;
    await signIn("resend", {
      email: parsed.data.email,
      redirectTo: "/dashboard",
    });
  }

  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="text-2xl font-bold">Sign in to Convene</h1>

      {sp.check ? (
        <p className="mt-4 rounded bg-green-50 p-3 text-sm text-green-800">
          Check your email for a magic link. In dev, the link is printed to the
          server console.
        </p>
      ) : null}

      <form action={sendLink} className="mt-6 space-y-3">
        <input
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          className="w-full rounded border border-neutral-300 p-2"
        />
        <button
          type="submit"
          className="w-full rounded bg-black p-2 text-white"
        >
          Send magic link
        </button>
      </form>
    </main>
  );
}
