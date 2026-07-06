import { randomUUID } from "node:crypto";
import { createTenantClient } from "@convene/db";
import { formQuestionSchema, renameSchema } from "@convene/schemas";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseQuestions } from "@/lib/forms";
import { requireMembership } from "@/lib/session";
import { BackLink, Badge, Button, Card, Input, PageShell, Select } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm";
import { Rollout } from "@/components/rollout";
import { SaveButton } from "@/components/save-button";

const TYPE_LABELS: Record<string, string> = {
  text: "Short answer",
  textarea: "Paragraph",
  number: "Number",
  select: "Dropdown",
  checkbox: "Checkbox",
};

export default async function FormBuilder({
  params,
}: {
  params: Promise<{ orgId: string; formId: string }>;
}) {
  const { orgId, formId } = await params;
  const { userId } = await requireMembership(orgId);

  const db = createTenantClient(orgId, userId);
  const form = await db.forms.get(formId);
  if (!form) redirect(`/o/${orgId}/forms`);

  const questions = parseQuestions(form.questions);

  async function addQuestion(formData: FormData) {
    "use server";
    const { userId } = await requireMembership(orgId);
    const db = createTenantClient(orgId, userId);
    const form = await db.forms.get(formId);
    if (!form) return;

    const type = String(formData.get("type") ?? "text");
    const optionsRaw = String(formData.get("options") ?? "");
    const parsed = formQuestionSchema.safeParse({
      id: randomUUID(),
      label: formData.get("label"),
      type,
      required: formData.get("required") === "on",
      options:
        type === "select"
          ? optionsRaw
              .split(",")
              .map((o) => o.trim())
              .filter(Boolean)
          : undefined,
    });
    if (!parsed.success) return;

    await db.forms.updateQuestions(formId, [
      ...parseQuestions(form.questions),
      parsed.data,
    ]);
    revalidatePath(`/o/${orgId}/forms/${formId}`);
  }

  async function deleteQuestion(formData: FormData) {
    "use server";
    const { userId } = await requireMembership(orgId);
    const db = createTenantClient(orgId, userId);
    const form = await db.forms.get(formId);
    if (!form) return;
    const id = String(formData.get("questionId"));
    await db.forms.updateQuestions(
      formId,
      parseQuestions(form.questions).filter((q) => q.id !== id),
    );
    revalidatePath(`/o/${orgId}/forms/${formId}`);
  }

  async function publish() {
    "use server";
    const { userId } = await requireMembership(orgId);
    const db = createTenantClient(orgId, userId);
    await db.forms.publish(formId);
    revalidatePath(`/o/${orgId}/forms/${formId}`);
  }

  async function renameForm(formData: FormData) {
    "use server";
    const { userId, role } = await requireMembership(orgId);
    if (role !== "OWNER" && role !== "ADMIN") return;
    const parsed = renameSchema.safeParse({ name: formData.get("name") });
    if (!parsed.success) return;
    const db = createTenantClient(orgId, userId);
    await db.forms.rename(formId, parsed.data.name);
    revalidatePath(`/o/${orgId}/forms/${formId}`);
  }

  async function toggleArchive() {
    "use server";
    const { userId, role } = await requireMembership(orgId);
    if (role !== "OWNER" && role !== "ADMIN") return;
    const db = createTenantClient(orgId, userId);
    const form = await db.forms.get(formId);
    if (!form) return;
    if (form.status === "ARCHIVED") await db.forms.unarchive(formId);
    else await db.forms.archive(formId);
    revalidatePath(`/o/${orgId}/forms/${formId}`);
  }

  async function deleteForm() {
    "use server";
    const { userId, role } = await requireMembership(orgId);
    if (role !== "OWNER" && role !== "ADMIN") return;
    const db = createTenantClient(orgId, userId);
    try {
      await db.forms.delete(formId);
    } catch {
      return; // has submissions — UI already disables this path
    }
    redirect(`/o/${orgId}/forms`);
  }

  return (
    <PageShell>
      <BackLink href={`/o/${orgId}/forms`}>Intake forms</BackLink>

      <div className="mt-3">
        <Rollout
          heading={
            <span className="flex min-w-0 items-center gap-3">
              <h1 className="min-w-0 truncate text-2xl font-bold tracking-tight">
                {form.name}
              </h1>
              <Badge>
                {form.status} · v{form.version}
              </Badge>
            </span>
          }
          label="Edit"
        >
          <Card className="p-4">
            <form action={renameForm} className="flex gap-2">
              <Input name="name" key={form.name} defaultValue={form.name} required />
              <SaveButton className="shrink-0" savedLabel="Renamed ✓">
                Rename
              </SaveButton>
            </form>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-3">
              <form action={toggleArchive}>
                <Button variant="ghost" className="px-3 py-1.5 text-sm">
                  {form.status === "ARCHIVED" ? "Unarchive (re-publish)" : "Archive"}
                </Button>
              </form>
              {form._count.submissions > 0 ? (
                <p className="text-xs text-stone-400">
                  Can&apos;t delete — {form._count.submissions}{" "}
                  {form._count.submissions === 1 ? "submission" : "submissions"}{" "}
                  would be lost. Archive hides it from pickers while keeping the
                  data.
                </p>
              ) : (
                <form action={deleteForm}>
                  <ConfirmButton
                    message={`Delete “${form.name}”? It has no submissions, so nothing else is affected. Events using it as intake will simply have no form.`}
                    className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 hover:text-red-700"
                  >
                    Delete form…
                  </ConfirmButton>
                </form>
              )}
            </div>
          </Card>
        </Rollout>
      </div>

      <div className="mt-8">
        <Rollout
          heading={
            <h2 className="text-lg font-semibold">
              Questions{" "}
              <span className="font-normal text-stone-400">
                ({questions.length})
              </span>
            </h2>
          }
          label="+ Add question"
          accent
        >
          <Card className="p-4">
            <form action={addQuestion} className="space-y-3">
              <Input
                name="label"
                required
                placeholder="Question, e.g. Any medical conditions?"
              />
              <div className="flex flex-wrap items-center gap-3">
                <Select name="type">
                  {Object.entries(TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
                <label className="flex items-center gap-2 text-sm text-stone-600">
                  <input
                    type="checkbox"
                    name="required"
                    className="h-4 w-4 rounded border-stone-300 accent-emerald-600"
                  />
                  Required
                </label>
              </div>
              <Input
                name="options"
                placeholder="Dropdown options, comma-separated (only for Dropdown)"
              />
              <Button className="w-full">Add question</Button>
            </form>
          </Card>
        </Rollout>
      </div>

      <ul className="mt-3 space-y-2">
        {questions.length === 0 ? (
          <li>
            <Card className="p-6 text-center text-stone-500">
              No questions yet — tap “+ Add question” to write the first one.
            </Card>
          </li>
        ) : (
          questions.map((q, i) => (
            <li key={q.id}>
              <Card className="flex items-center justify-between gap-3 p-4">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-stone-900">
                    {i + 1}. {q.label}
                    {q.required ? <span className="text-red-500"> *</span> : null}
                  </span>
                  <span className="mt-0.5 block text-sm text-stone-500">
                    {TYPE_LABELS[q.type] ?? q.type}
                    {q.options?.length ? ` — ${q.options.join(" / ")}` : ""}
                  </span>
                </span>
                <form action={deleteQuestion}>
                  <input type="hidden" name="questionId" value={q.id} />
                  <Button variant="ghost" className="px-2.5 py-1.5 text-sm text-red-500 hover:bg-red-50 hover:text-red-700">
                    Remove
                  </Button>
                </form>
              </Card>
            </li>
          ))
        )}
      </ul>

      <Card className="mt-4 p-5">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-stone-500">
            {form.status === "PUBLISHED"
              ? "Publishing again applies your edits and bumps the version."
              : "Publish to make this form usable on events."}
          </p>
          <form action={publish}>
            <Button variant="accent" className="shrink-0">
              {form.status === "PUBLISHED" ? "Publish changes" : "Publish"}
            </Button>
          </form>
        </div>
      </Card>

    </PageShell>
  );
}
