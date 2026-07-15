import { formQuestionsSchema, type FormAnswer, type FormQuestion } from "@convene/schemas";

/** Safely parse a template's questions JSON (defensive against bad data). */
export function parseQuestions(raw: unknown): FormQuestion[] {
  const parsed = formQuestionsSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

/**
 * Build self-describing answers from a submitted form. Inputs are named
 * `q_<questionId>`; checkboxes submit "on" and are normalized to yes/no.
 */
export function buildAnswers(
  questions: FormQuestion[],
  formData: FormData,
): FormAnswer[] {
  const answers: FormAnswer[] = [];
  for (const q of questions) {
    // Multi-select: join every checked option.
    if (q.type === "checkboxes") {
      const values = formData
        .getAll(`q_${q.id}`)
        .filter((v): v is string => typeof v === "string");
      answers.push({ questionId: q.id, label: q.label, value: values.join(", ") });
      continue;
    }

    const raw = formData.get(`q_${q.id}`);

    if (q.type === "agreement") {
      // Required checkbox; record explicit acceptance (with the doc name so the
      // submission is self-describing about what was agreed to).
      answers.push({
        questionId: q.id,
        label: q.label,
        value:
          raw === "on"
            ? `Agreed${q.documentName ? ` — ${q.documentName}` : ""}`
            : "Not agreed",
      });
      continue;
    }

    const value =
      q.type === "checkbox"
        ? raw === "on"
          ? "yes"
          : "no"
        : typeof raw === "string"
          ? raw.trim()
          : "";
    if (value !== "" || q.type === "checkbox") {
      answers.push({ questionId: q.id, label: q.label, value });
    }
  }
  return answers;
}
