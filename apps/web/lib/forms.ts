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
    const raw = formData.get(`q_${q.id}`);
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
