import { AwsClient } from "aws4fetch";

/**
 * Cloudflare R2 storage (S3-compatible). The bucket stays PRIVATE — images are
 * served through short-lived presigned GET URLs, so photo visibility rules are
 * actually enforced. Uploads are proxied through our API (no bucket CORS
 * setup needed).
 *
 * Required env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.
 */

export function r2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET,
  );
}

function client(): AwsClient {
  return new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    service: "s3",
    region: "auto",
  });
}

function objectUrl(key: string): string {
  const account = process.env.R2_ACCOUNT_ID!;
  const bucket = process.env.R2_BUCKET!;
  return `https://${account}.r2.cloudflarestorage.com/${bucket}/${key}`;
}

export async function r2Put(
  key: string,
  body: ArrayBuffer,
  contentType: string,
): Promise<void> {
  const res = await client().fetch(objectUrl(key), {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body,
  });
  if (!res.ok) throw new Error(`R2 upload failed: ${res.status}`);
}

export async function r2Delete(key: string): Promise<void> {
  const res = await client().fetch(objectUrl(key), { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    throw new Error(`R2 delete failed: ${res.status}`);
  }
}

/** Presigned GET URL, valid for `expiresSeconds` (default 1 hour). */
export async function r2PresignGet(
  key: string,
  expiresSeconds = 3600,
): Promise<string> {
  const url = new URL(objectUrl(key));
  url.searchParams.set("X-Amz-Expires", String(expiresSeconds));
  const signed = await client().sign(new Request(url, { method: "GET" }), {
    aws: { signQuery: true },
  });
  return signed.url;
}
