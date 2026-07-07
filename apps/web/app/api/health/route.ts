import { NextResponse } from "next/server";

/**
 * Deployment diagnostics — reports which integrations the RUNNING process can
 * see. Booleans only, never values, so this is safe to expose.
 */
export async function GET() {
  // The AUTH_URL host is public information (it's on every auth redirect),
  // so exposing it here is safe and makes domain-cutover issues diagnosable.
  let authUrlHost: string | null = null;
  try {
    authUrlHost = process.env.AUTH_URL ? new URL(process.env.AUTH_URL).host : null;
  } catch {
    authUrlHost = "INVALID-URL";
  }

  return NextResponse.json({
    commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    authUrlHost,
    env: {
      database: Boolean(process.env.DATABASE_URL),
      authUrl: Boolean(process.env.AUTH_URL),
      resend: Boolean(process.env.RESEND_API_KEY),
      r2AccountId: Boolean(process.env.R2_ACCOUNT_ID),
      r2AccessKeyId: Boolean(process.env.R2_ACCESS_KEY_ID),
      r2SecretAccessKey: Boolean(process.env.R2_SECRET_ACCESS_KEY),
      r2Bucket: Boolean(process.env.R2_BUCKET),
    },
  });
}
