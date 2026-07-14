import type { FormQuestion } from "@convene/schemas";
import { r2Configured, r2PresignGet } from "@/lib/r2";

/** A question plus a short-lived, viewable URL for its agreement document. */
export type RenderableQuestion = FormQuestion & { documentUrl?: string };

/**
 * Adds a presigned `documentUrl` to any agreement question that has an uploaded
 * document, so participants (even anonymous ones on the public page) can view
 * it. Runs server-side; the URL is short-lived.
 */
export async function withDocumentUrls(
  questions: FormQuestion[],
): Promise<RenderableQuestion[]> {
  if (!r2Configured()) return questions;
  return Promise.all(
    questions.map(async (q) =>
      q.type === "agreement" && q.documentKey
        ? { ...q, documentUrl: await r2PresignGet(q.documentKey) }
        : q,
    ),
  );
}
