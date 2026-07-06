import type { FormQuestion } from "@convene/schemas";
import { Input, Select, Textarea } from "@/components/ui";

/** Renders a form template's questions as inputs named `q_<questionId>`. */
export function QuestionFields({ questions }: { questions: FormQuestion[] }) {
  return (
    <>
      {questions.map((q) => (
        <label key={q.id} className="block text-sm font-medium text-stone-700">
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
      ))}
    </>
  );
}
