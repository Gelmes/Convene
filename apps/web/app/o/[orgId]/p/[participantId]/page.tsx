import { createTenantClient, prisma } from "@convene/db";
import { formAnswersSchema } from "@convene/schemas";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { buildAnswers, parseQuestions } from "@/lib/forms";
import { sendInviteEmail } from "@/lib/mailer";
import { requireMembership } from "@/lib/session";
import { formatDateTime } from "@/lib/format";
import { BackLink, Badge, Button, Card, PageShell } from "@/components/ui";
import { CopyField } from "@/components/copy-field";
import { QuestionFields } from "@/components/question-fields";

export default async function ParticipantDetail({
  params,
}: {
  params: Promise<{ orgId: string; participantId: string }>;
}) {
  const { orgId, participantId } = await params;
  const { userId } = await requireMembership(orgId);

  const db = createTenantClient(orgId, userId);
  const participant = await db.participants.get(participantId);
  if (!participant) redirect(`/o/${orgId}`);

  const [submissions, readings, publishedForms, activeInvite, latestReg, org] =
    await Promise.all([
      db.submissions.listForParticipant(participantId),
      db.healthReadings.listForParticipant(participantId),
      db.forms.listPublished(),
      db.invites.getActiveForParticipant(participantId),
      db.registrations.latestForParticipant(participantId),
      prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
    ]);

  const origin = (process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const inviteUrl = activeInvite ? `${origin}/i/${activeInvite.token}` : null;
  const emailEnabled = Boolean(process.env.RESEND_API_KEY);

  async function hostFill(formData: FormData) {
    "use server";
    const { userId } = await requireMembership(orgId);
    const db = createTenantClient(orgId, userId);
    const formId = String(formData.get("formTemplateId"));
    const form = await db.forms.get(formId);
    if (!form) return;

    const answers = buildAnswers(parseQuestions(form.questions), formData);
    const parsed = formAnswersSchema.safeParse(answers);
    if (!parsed.success || parsed.data.length === 0) return;

    await db.submissions.create({
      formTemplateId: formId,
      participantId,
      answers: parsed.data,
      filledBy: "HOST",
    });
    revalidatePath(`/o/${orgId}/p/${participantId}`);
  }

  async function createInvite() {
    "use server";
    const { userId } = await requireMembership(orgId);
    const db = createTenantClient(orgId, userId);
    const latestReg = await db.registrations.latestForParticipant(participantId);
    await db.invites.create({
      participantId,
      eventId: latestReg?.eventId,
    });
    revalidatePath(`/o/${orgId}/p/${participantId}`);
  }

  async function emailInvite() {
    "use server";
    const { userId } = await requireMembership(orgId);
    const db = createTenantClient(orgId, userId);
    const [invite, p, org, latestReg] = await Promise.all([
      db.invites.getActiveForParticipant(participantId),
      db.participants.get(participantId),
      prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
      db.registrations.latestForParticipant(participantId),
    ]);
    if (!invite || !p?.email) return;

    const origin = (process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
    const sent = await sendInviteEmail({
      to: p.email,
      orgName: org?.name ?? "Your host",
      eventTitle: latestReg?.event.title,
      url: `${origin}/i/${invite.token}`,
    });
    if (sent) await db.invites.markEmailed(invite.id, p.email);
    revalidatePath(`/o/${orgId}/p/${participantId}`);
  }

  return (
    <PageShell>
      <BackLink href={`/o/${orgId}`}>Events</BackLink>
      <h1 className="mt-3 text-2xl font-bold tracking-tight">
        {participant.firstName} {participant.lastName ?? ""}
      </h1>
      <p className="mt-1 text-sm text-stone-500">
        {[participant.email, participant.phone].filter(Boolean).join(" · ") ||
          "No contact info"}
      </p>

      {/* --- Personal invite link --- */}
      <Card className="mt-6 p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-medium">Invite link</h3>
          {activeInvite?.email ? <Badge>Emailed</Badge> : null}
        </div>
        <p className="mt-1 text-xs text-stone-400">
          A personal link for {participant.firstName} to confirm their contact
          info and fill their intake
          {latestReg ? ` for ${latestReg.event.title}` : ""}. Expires 30 days
          after creation, single use.
        </p>
        {inviteUrl ? (
          <div className="mt-3 space-y-2">
            <CopyField value={inviteUrl} />
            <div className="flex items-center justify-between gap-3">
              <form action={emailInvite}>
                <Button
                  variant="ghost"
                  className="px-3 py-1.5 text-sm"
                  disabled={!emailEnabled || !participant.email}
                >
                  {participant.email
                    ? emailEnabled
                      ? `Email to ${participant.email}`
                      : "Email (needs RESEND_API_KEY)"
                    : "Email (no address on file)"}
                </Button>
              </form>
              <form action={createInvite}>
                <Button variant="ghost" className="px-3 py-1.5 text-sm">
                  New link
                </Button>
              </form>
            </div>
          </div>
        ) : (
          <form action={createInvite} className="mt-3">
            <Button className="w-full">Create invite link</Button>
          </form>
        )}
      </Card>

      {/* --- Blood pressure history --- */}
      <h2 className="mt-8 text-lg font-semibold">
        Blood pressure{" "}
        <span className="font-normal text-stone-400">({readings.length})</span>
      </h2>
      <ul className="mt-3 space-y-2">
        {readings.length === 0 ? (
          <li>
            <Card className="p-5 text-center text-sm text-stone-500">
              No readings yet.
            </Card>
          </li>
        ) : (
          readings.map((r) => (
            <li key={r.id}>
              <Card className="flex items-center justify-between p-4">
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium tabular-nums text-emerald-700 ring-1 ring-inset ring-emerald-600/10">
                  {r.systolic}/{r.diastolic}
                  {r.pulse ? <span className="text-emerald-600/70"> · {r.pulse}</span> : null}
                </span>
                <span className="ml-3 min-w-0 flex-1 truncate px-3 text-sm text-stone-500">
                  {r.note ?? ""}
                </span>
                <span className="shrink-0 text-xs text-stone-400">
                  {formatDateTime(r.takenAt)}
                </span>
              </Card>
            </li>
          ))
        )}
      </ul>

      {/* --- Intake submissions --- */}
      <h2 className="mt-8 text-lg font-semibold">
        Intake{" "}
        <span className="font-normal text-stone-400">({submissions.length})</span>
      </h2>
      <ul className="mt-3 space-y-3">
        {submissions.length === 0 ? (
          <li>
            <Card className="p-5 text-center text-sm text-stone-500">
              No intake submissions yet.
            </Card>
          </li>
        ) : (
          submissions.map((s) => {
            const answers = formAnswersSchema.safeParse(s.answers);
            return (
              <li key={s.id}>
                <Card className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-stone-900">
                      {s.formTemplate.name}
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge>{s.filledBy === "HOST" ? "Filled by host" : "Self-filled"}</Badge>
                      <span className="text-xs text-stone-400">
                        {formatDateTime(s.createdAt)}
                      </span>
                    </span>
                  </div>
                  <dl className="mt-3 space-y-2 border-t border-stone-100 pt-3">
                    {(answers.success ? answers.data : []).map((a) => (
                      <div key={a.questionId} className="text-sm">
                        <dt className="text-stone-500">{a.label}</dt>
                        <dd className="mt-0.5 font-medium text-stone-900">
                          {a.value || "—"}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </Card>
              </li>
            );
          })
        )}
      </ul>

      {/* --- Host fill --- */}
      {publishedForms.length > 0 ? (
        <Card className="mt-8 p-5">
          <h3 className="font-medium">Fill a form for this participant</h3>
          <p className="mt-1 text-xs text-stone-400">
            Filing again records a new submission — history is preserved.
          </p>
          {publishedForms.map((form) => {
            const questions = parseQuestions(form.questions);
            if (questions.length === 0) return null;
            return (
              <details key={form.id} className="mt-3 rounded-xl border border-stone-200">
                <summary className="cursor-pointer select-none p-3 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50">
                  {form.name}
                </summary>
                <form action={hostFill} className="space-y-4 border-t border-stone-100 p-4">
                  <input type="hidden" name="formTemplateId" value={form.id} />
                  <QuestionFields questions={questions} />
                  <Button variant="accent" className="w-full">
                    Save answers
                  </Button>
                </form>
              </details>
            );
          })}
        </Card>
      ) : null}
    </PageShell>
  );
}
