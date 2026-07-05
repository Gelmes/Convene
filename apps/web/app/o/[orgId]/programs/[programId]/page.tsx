import { createTenantClient } from "@convene/db";
import { advanceModeSchema, createStageSchema, renameSchema } from "@convene/schemas";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { BackLink, Badge, Button, Card, Input, PageShell } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm";
import { SaveButton } from "@/components/save-button";

const selectCls =
  "rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20";

export default async function ProgramDetail({
  params,
}: {
  params: Promise<{ orgId: string; programId: string }>;
}) {
  const { orgId, programId } = await params;
  const { userId } = await requireMembership(orgId);

  const db = createTenantClient(orgId, userId);
  const program = await db.programs.get(programId);
  if (!program) redirect(`/o/${orgId}/programs`);

  const [enrollments, participants, publishedForms] = await Promise.all([
    db.enrollments.listForProgram(programId),
    db.participants.list(),
    db.forms.listPublished(),
  ]);

  const enrolledIds = new Set(enrollments.map((e) => e.participantId));
  const enrollable = participants.filter((p) => !enrolledIds.has(p.id));
  const path = `/o/${orgId}/programs/${programId}`;

  // --- Stage actions --------------------------------------------------------
  async function addStage(formData: FormData) {
    "use server";
    const { userId } = await requireMembership(orgId);
    const parsed = createStageSchema.safeParse({ name: formData.get("name") });
    if (!parsed.success) return;
    const db = createTenantClient(orgId, userId);
    await db.programs.addStage(programId, parsed.data.name);
    revalidatePath(path);
  }

  async function removeStage(formData: FormData) {
    "use server";
    const { userId } = await requireMembership(orgId);
    const db = createTenantClient(orgId, userId);
    await db.programs.removeStage(String(formData.get("stageId")));
    revalidatePath(path);
  }

  async function moveStage(formData: FormData) {
    "use server";
    const { userId } = await requireMembership(orgId);
    const db = createTenantClient(orgId, userId);
    await db.programs.moveStage(
      String(formData.get("stageId")),
      Number(formData.get("direction")) === -1 ? -1 : 1,
    );
    revalidatePath(path);
  }

  async function setStageForm(formData: FormData) {
    "use server";
    const { userId } = await requireMembership(orgId);
    const db = createTenantClient(orgId, userId);
    const formId = String(formData.get("formTemplateId") ?? "");
    await db.programs.setStageRequiredForm(
      String(formData.get("stageId")),
      formId || null,
    );
    revalidatePath(path);
  }

  // --- Enrollment actions ----------------------------------------------------
  async function enroll(formData: FormData) {
    "use server";
    const { userId } = await requireMembership(orgId);
    const db = createTenantClient(orgId, userId);
    const participantId = String(formData.get("participantId") ?? "");
    if (!participantId) return;
    await db.enrollments.enroll(programId, participantId);
    revalidatePath(path);
  }

  async function advance(formData: FormData) {
    "use server";
    const { userId } = await requireMembership(orgId);
    const db = createTenantClient(orgId, userId);
    await db.enrollments.advance(String(formData.get("enrollmentId")));
    revalidatePath(path);
  }

  async function moveTo(formData: FormData) {
    "use server";
    const { userId } = await requireMembership(orgId);
    const db = createTenantClient(orgId, userId);
    const stageId = String(formData.get("stageId") ?? "");
    if (!stageId) return;
    await db.enrollments.moveTo(String(formData.get("enrollmentId")), stageId);
    revalidatePath(path);
  }

  async function setStatus(formData: FormData) {
    "use server";
    const { userId } = await requireMembership(orgId);
    const db = createTenantClient(orgId, userId);
    const status = String(formData.get("status")) as
      | "ACTIVE"
      | "PAUSED"
      | "DROPPED";
    if (!["ACTIVE", "PAUSED", "DROPPED"].includes(status)) return;
    await db.enrollments.setStatus(String(formData.get("enrollmentId")), status);
    revalidatePath(path);
  }

  async function resetEnrollment(formData: FormData) {
    "use server";
    const { userId } = await requireMembership(orgId);
    const db = createTenantClient(orgId, userId);
    await db.enrollments.reset(String(formData.get("enrollmentId")));
    revalidatePath(path);
  }

  async function removeEnrollment(formData: FormData) {
    "use server";
    const { userId } = await requireMembership(orgId);
    const db = createTenantClient(orgId, userId);
    await db.enrollments.remove(String(formData.get("enrollmentId")));
    revalidatePath(path);
  }

  async function setAdvanceMode(formData: FormData) {
    "use server";
    const { userId } = await requireMembership(orgId);
    const parsed = advanceModeSchema.safeParse(formData.get("advanceMode"));
    if (!parsed.success) return;
    const db = createTenantClient(orgId, userId);
    await db.programs.setAdvanceMode(programId, parsed.data);
    revalidatePath(path);
  }

  async function renameProgram(formData: FormData) {
    "use server";
    const { userId, role } = await requireMembership(orgId);
    if (role !== "OWNER" && role !== "ADMIN") return;
    const parsed = renameSchema.safeParse({ name: formData.get("name") });
    if (!parsed.success) return;
    const db = createTenantClient(orgId, userId);
    await db.programs.rename(programId, parsed.data.name);
    revalidatePath(path);
  }

  async function deleteProgram() {
    "use server";
    const { userId, role } = await requireMembership(orgId);
    if (role !== "OWNER" && role !== "ADMIN") return;
    const db = createTenantClient(orgId, userId);
    await db.programs.delete(programId);
    redirect(`/o/${orgId}/programs`);
  }

  return (
    <PageShell>
      <BackLink href={`/o/${orgId}/programs`}>Programs</BackLink>
      <h1 className="mt-3 text-2xl font-bold tracking-tight">{program.name}</h1>

      {/* --- Stages ----------------------------------------------------------- */}
      <h2 className="mt-8 text-lg font-semibold">
        Stages{" "}
        <span className="font-normal text-stone-400">({program.stages.length})</span>
      </h2>
      <ul className="mt-3 space-y-2">
        {program.stages.length === 0 ? (
          <li>
            <Card className="p-6 text-center text-stone-500">
              No stages yet — add the steps of this journey below.
            </Card>
          </li>
        ) : (
          program.stages.map((s, i) => (
            <li key={s.id}>
              <Card className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-900 text-xs font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="truncate font-medium text-stone-900">
                      {s.name}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <form action={moveStage}>
                      <input type="hidden" name="stageId" value={s.id} />
                      <input type="hidden" name="direction" value="-1" />
                      <Button variant="ghost" className="px-2 py-1 text-sm" disabled={i === 0}>
                        ↑
                      </Button>
                    </form>
                    <form action={moveStage}>
                      <input type="hidden" name="stageId" value={s.id} />
                      <input type="hidden" name="direction" value="1" />
                      <Button
                        variant="ghost"
                        className="px-2 py-1 text-sm"
                        disabled={i === program.stages.length - 1}
                      >
                        ↓
                      </Button>
                    </form>
                    <form action={removeStage}>
                      <input type="hidden" name="stageId" value={s.id} />
                      <Button
                        variant="ghost"
                        className="px-2 py-1 text-sm text-red-500 hover:bg-red-50 hover:text-red-700"
                      >
                        ✕
                      </Button>
                    </form>
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3 text-xs text-stone-500">
                  <span>
                    {s._count.events > 0
                      ? `${s._count.events} linked ${s._count.events === 1 ? "event" : "events"}`
                      : "No linked events"}
                    {" · requires form:"}
                  </span>
                  <form action={setStageForm} className="flex items-center gap-1.5">
                    <input type="hidden" name="stageId" value={s.id} />
                    <select
                      name="formTemplateId"
                      key={s.requiredForm?.id ?? "none"}
                      defaultValue={s.requiredForm?.id ?? ""}
                      className={selectCls}
                    >
                      <option value="">None</option>
                      {publishedForms.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                    <SaveButton variant="ghost" className="px-2.5 py-1.5 text-xs">
                      Save
                    </SaveButton>
                  </form>
                </div>
              </Card>
            </li>
          ))
        )}
      </ul>
      <Card className="mt-4 p-4">
        <form action={addStage} className="flex gap-2">
          <Input name="name" required placeholder="New stage, e.g. Level 1" />
          <Button className="shrink-0">Add stage</Button>
        </form>
        <p className="mt-2 text-xs text-stone-400">
          Tip: link an event to a stage from the event&apos;s settings — attending
          it marks the participant ready to advance.
        </p>
      </Card>

      <Card className="mt-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-stone-700">Advancement</h3>
            <p className="mt-0.5 max-w-xs text-xs text-stone-400">
              {program.advanceMode === "AUTO"
                ? "Participants advance on their own when a stage's requirements are met."
                : "Requirements only suggest (Ready ✓) — you confirm every advance."}
            </p>
          </div>
          <form action={setAdvanceMode} className="flex items-center gap-1.5">
            <select
              name="advanceMode"
              key={program.advanceMode}
              defaultValue={program.advanceMode}
              className={selectCls}
            >
              <option value="MANUAL">Manual — I confirm</option>
              <option value="AUTO">Automatic</option>
            </select>
            <SaveButton variant="ghost" className="px-2.5 py-1.5 text-xs">
              Save
            </SaveButton>
          </form>
        </div>
      </Card>

      {/* --- Enrolled participants --------------------------------------------- */}
      <h2 className="mt-10 text-lg font-semibold">
        Participants{" "}
        <span className="font-normal text-stone-400">({enrollments.length})</span>
      </h2>
      <ul className="mt-3 space-y-3">
        {enrollments.length === 0 ? (
          <li>
            <Card className="p-6 text-center text-stone-500">
              Nobody enrolled yet — add someone below.
            </Card>
          </li>
        ) : (
          enrollments.map((e) => (
            <li key={e.id}>
              <Card className="overflow-hidden">
                <details className="group">
                  <summary className="flex cursor-pointer select-none items-center justify-between gap-3 p-4 transition-colors hover:bg-stone-50">
                    <span className="min-w-0 truncate font-medium text-stone-900">
                      {e.participant.firstName} {e.participant.lastName ?? ""}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {e.ready ? (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                          Ready ✓
                        </span>
                      ) : null}
                      <Badge>
                        {e.status === "COMPLETED"
                          ? "Completed 🎉"
                          : e.status !== "ACTIVE"
                            ? e.status
                            : (e.currentStage?.name ?? "No stage")}
                      </Badge>
                    </span>
                  </summary>

                  <div className="space-y-3 border-t border-stone-100 bg-stone-50/50 p-4">
                    {/* progress dots */}
                    <div className="flex items-center gap-1.5">
                      {program.stages.map((s) => {
                        const done = e.completions.some((c) => c.stageId === s.id);
                        const current = e.currentStageId === s.id;
                        return (
                          <span
                            key={s.id}
                            title={s.name}
                            className={`h-2.5 flex-1 rounded-full ${
                              done
                                ? "bg-emerald-500"
                                : current
                                  ? "bg-emerald-200 ring-1 ring-inset ring-emerald-500"
                                  : "bg-stone-200"
                            }`}
                          />
                        );
                      })}
                    </div>

                    {e.status === "ACTIVE" && e.currentStage ? (
                      <form action={advance}>
                        <input type="hidden" name="enrollmentId" value={e.id} />
                        <Button variant="accent" className="w-full">
                          Complete “{e.currentStage.name}” → advance
                        </Button>
                      </form>
                    ) : null}

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <form action={moveTo} className="flex items-center gap-1.5">
                        <input type="hidden" name="enrollmentId" value={e.id} />
                        <select name="stageId" defaultValue="" className={selectCls}>
                          <option value="" disabled>
                            Move to stage…
                          </option>
                          {program.stages.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                        <Button variant="ghost" className="px-2.5 py-1.5 text-xs">
                          Move
                        </Button>
                      </form>
                      <form action={setStatus} className="flex items-center gap-1">
                        <input type="hidden" name="enrollmentId" value={e.id} />
                        {e.status === "PAUSED" ? (
                          <Button
                            name="status"
                            value="ACTIVE"
                            variant="ghost"
                            className="px-2.5 py-1.5 text-xs"
                          >
                            Resume
                          </Button>
                        ) : (
                          <Button
                            name="status"
                            value="PAUSED"
                            variant="ghost"
                            className="px-2.5 py-1.5 text-xs"
                          >
                            Pause
                          </Button>
                        )}
                        <Button
                          name="status"
                          value="DROPPED"
                          variant="ghost"
                          className="px-2.5 py-1.5 text-xs text-red-500 hover:bg-red-50 hover:text-red-700"
                        >
                          Drop
                        </Button>
                      </form>
                    </div>

                    <div className="flex items-center gap-1 border-t border-stone-100 pt-2">
                      <form action={resetEnrollment}>
                        <input type="hidden" name="enrollmentId" value={e.id} />
                        <ConfirmButton
                          message={`Reset ${e.participant.firstName}'s progress? All completed stages are cleared and they go back to the first stage.`}
                          className="px-2.5 py-1.5 text-xs"
                        >
                          ↺ Reset progress
                        </ConfirmButton>
                      </form>
                      <form action={removeEnrollment}>
                        <input type="hidden" name="enrollmentId" value={e.id} />
                        <ConfirmButton
                          message={`Remove ${e.participant.firstName} from this program entirely? Their progress here is deleted (their events, readings, and intake are kept). Use Drop instead to keep the record.`}
                          className="px-2.5 py-1.5 text-xs text-red-500 hover:bg-red-50 hover:text-red-700"
                        >
                          Remove from program
                        </ConfirmButton>
                      </form>
                    </div>

                    <a
                      href={`/o/${orgId}/p/${e.participantId}`}
                      className="block text-xs font-medium text-stone-500 underline-offset-2 hover:text-emerald-700 hover:underline"
                    >
                      History &amp; intake →
                    </a>
                  </div>
                </details>
              </Card>
            </li>
          ))
        )}
      </ul>

      {enrollable.length > 0 ? (
        <Card className="mt-4 p-4">
          <form action={enroll} className="flex gap-2">
            <select name="participantId" required defaultValue="" className={`${selectCls} flex-1`}>
              <option value="" disabled>
                Choose a participant…
              </option>
              {enrollable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.firstName} {p.lastName ?? ""}
                </option>
              ))}
            </select>
            <Button className="shrink-0">Enroll</Button>
          </form>
        </Card>
      ) : null}

      {/* --- Manage ------------------------------------------------------------ */}
      <Card className="mt-10 border-red-100 p-5">
        <h3 className="font-medium">Manage program</h3>
        <form action={renameProgram} className="mt-3 flex gap-2">
          <Input name="name" key={program.name} defaultValue={program.name} required />
          <SaveButton className="shrink-0" savedLabel="Renamed ✓">Rename</SaveButton>
        </form>
        <form action={deleteProgram} className="mt-3 border-t border-stone-100 pt-3">
          <ConfirmButton
            message={`Delete “${program.name}”? This permanently removes its ${program.stages.length} stage${program.stages.length === 1 ? "" : "s"} and ${enrollments.length} enrollment${enrollments.length === 1 ? "" : "s"} (all progress history). Participants themselves — and their events, readings, and intake — are NOT deleted. Linked events lose their stage link.`}
            className="w-full text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            Delete program…
          </ConfirmButton>
        </form>
      </Card>
    </PageShell>
  );
}
