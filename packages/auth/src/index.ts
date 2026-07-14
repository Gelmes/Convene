import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@convene/db";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";

/** Google shows up as a sign-in option only when its env vars are set. */
export function googleEnabled(): boolean {
  return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
}

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
      subject: "Your Vitalgather sign-in link",
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#1c1917">Sign in to Vitalgather</h2>
          <p style="color:#57534e;line-height:1.6">
            Tap the button below to sign in. No password needed.
          </p>
          <a href="${url}"
             style="display:inline-block;background:#059669;color:#fff;padding:12px 24px;
                    border-radius:12px;text-decoration:none;font-weight:600">
            Sign in
          </a>
          <p style="color:#a8a29e;font-size:12px;margin-top:24px">
            This link is single-use and expires shortly. If you didn't request
            it, you can safely ignore this email.
          </p>
        </div>`,
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
    // Reads AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET. Linking by email is safe for
    // Google (it verifies addresses), and required so existing magic-link
    // users land in the SAME account when they switch to Google.
    Google({ allowDangerousEmailAccountLinking: true }),
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
