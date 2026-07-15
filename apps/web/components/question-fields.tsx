import type { FormQuestion } from "@convene/schemas";
import { Input, Select, Textarea } from "@/components/ui";
import { AgreementField } from "@/components/agreement-field";
import { CheckboxGroup } from "@/components/checkbox-group";

type RenderableQuestion = FormQuestion & { documentUrl?: string };

/** Renders a form template's questions as inputs named `q_<questionId>`. */
export function QuestionFields({
  questions,
}: {
  questions: RenderableQuestion[];
}) {
  return (
    <>
      {questions.map((q) => {
        if (q.type === "agreement") {
          return (
            <AgreementField
              key={q.id}
              id={q.id}
              label={q.label}
              agreementText={q.agreementText}
              documentUrl={q.documentUrl}
              documentName={q.documentName}
            />
          );
        }

        // Choice groups (radio / checkboxes) get their own block, not a <label>.
        if (q.type === "radio" || q.type === "checkboxes") {
          return (
            <fieldset key={q.id} className="block">
              <legend className="text-sm font-medium text-stone-700">
                {q.label}
                {q.required ? <span className="text-red-500"> *</span> : null}
                {q.type === "checkboxes" ? (
                  <span className="ml-1 font-normal text-stone-400">
                    (select all that apply)
                  </span>
                ) : null}
              </legend>
              {q.type === "checkboxes" ? (
                <CheckboxGroup
                  id={q.id}
                  options={q.options ?? []}
                  required={Boolean(q.required)}
                />
              ) : (
                <div className="mt-1.5 space-y-1.5">
                  {(q.options ?? []).map((opt) => (
                    <label
                      key={opt}
                      className="flex items-center gap-2 text-sm font-normal text-stone-600"
                    >
                      <input
                        type="radio"
                        name={`q_${q.id}`}
                        value={opt}
                        required={q.required}
                        className="h-4 w-4 border-stone-300 accent-emerald-600"
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          );
        }

        return (
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
        );
      })}
    </>
  );
}
