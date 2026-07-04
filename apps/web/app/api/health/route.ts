import { NextResponse } from "next/server";

/**
 * Deployment diagnostics — reports which integrations the RUNNING process can
 * see. Booleans only, never values, so this is safe to expose.
 */
export async function GET() {
  return NextResponse.json({
    commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
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
