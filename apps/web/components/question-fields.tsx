import type { FormQuestion } from "@convene/schemas";
import { Input, Select, Textarea } from "@/components/ui";

type RenderableQuestion = FormQuestion & { documentUrl?: string };

/** Renders a form template's questions as inputs named `q_<questionId>`. */
export function QuestionFields({
  questions,
}: {
  questions: RenderableQuestion[];
}) {
  return (
    <>
      {questions.map((q) =>
        q.type === "agreement" ? (
          <div
            key={q.id}
            className="rounded-xl border border-stone-200 bg-stone-50/60 p-4"
          >
            <p className="text-sm font-semibold text-stone-800">{q.label}</p>
            {q.agreementText ? (
              <div className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-stone-200 bg-white p-3 text-xs leading-relaxed text-stone-600">
                {q.agreementText}
              </div>
            ) : null}
            {q.documentUrl ? (
              <a
                href={q.documentUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-800"
              >
                📄 View {q.documentName ?? "document"} ↗
              </a>
            ) : null}
            <label className="mt-3 flex items-center gap-2 text-sm font-medium text-stone-700">
              <input
                type="checkbox"
                name={`q_${q.id}`}
                required
                className="h-4 w-4 rounded border-stone-300 accent-emerald-600"
              />
              I have read and agree
              <span className="text-red-500">*</span>
            </label>
          </div>
        ) : (
          <label
            key={q.id}
            className="block text-sm font-medium text-stone-700"
          >
            {q.label}
            {q.required ? <span className="text-red-500"> *</span> : null}
            {q.type === "textarea" ? (
              <Textarea
                name={`q_${q.id}`}
                required={q.required}
                rows={3}
                className="mt-1.5"
              />
            ) : q.type === "select" ? (
              <Select
                name={`q_${q.id}`}
                required={q.required}
                defaultValue=""
                className="mt-1.5 w-full"
              >
                <option value="" disabled>
                  Choose…
                </option>
                {(q.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </Select>
            ) : q.type === "checkbox" ? (
              <span className="mt-1.5 flex items-center gap-2 font-normal text-stone-600">
                <input
                  type="checkbox"
                  name={`q_${q.id}`}
                  required={q.required}
                  className="h-4 w-4 rounded border-stone-300 accent-emerald-600"
                />
                Yes
              </span>
            ) : (
              <Input
                name={`q_${q.id}`}
                type={q.type === "number" ? "number" : "text"}
                inputMode={q.type === "number" ? "numeric" : undefined}
                required={q.required}
                className="mt-1.5"
              />
            )}
          </label>
        ),
      )}
    </>
  );
}
