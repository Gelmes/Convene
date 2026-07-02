import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@convene/db";
import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";

/**
 * Sends the magic-link email. In dev (or when RESEND_API_KEY is unset) the link
 * is printed to the server console so you can sign in without email set up.
 */
async function sendMagicLink(to: string, url: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "onboarding@resend.dev";

  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.log(`\n\u{1F517}  [dev] Magic sign-in link for ${to}:\n${url}\n`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: "Your Convene sign-in link",
      html: `<p>Click to sign in to Convene:</p><p><a href="${url}">${url}</a></p><p>This link expires shortly.</p>`,
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend send failed: ${res.status} ${await res.text()}`);
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/sign-in",
    verifyRequest: "/sign-in?check=1",
  },
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY ?? "dev-no-key",
      from: process.env.EMAIL_FROM ?? "onboarding@resend.dev",
      async sendVerificationRequest({ identifier, url }) {
        await sendMagicLink(identifier, url);
      },
    }),
  ],
  callbacks: {
    session({ session, token }) {
      if (token.sub) {
        (session.user as { id?: string }).id = token.sub;
      }
      return session;
    },
  },
});

/** Convenience: the current user's id, or null. */
export async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}
