import { acceptInvite, getInviteByToken } from "@convene/db";
import { acceptInviteSchema, formQuestionsSchema } from "@convene/schemas";
import Link from "next/link";
import { redirect } from "next/navigation";
import { withDocumentUrls } from "@/lib/agreements";
import { buildAnswers } from "@/lib/forms";
import { formatDateTime } from "@/lib/format";
import { Brand, Button, Card, Input, PageShell } from "@/components/ui";
import { QuestionFields } from "@/components/question-fields";

function Message({
  title,
  body,
  ctaHref,
  ctaLabel,
}: {
  title: string;
  body: string;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return (
    <PageShell width="max-w-md">
      <div className="flex justify-center">
        <Brand />
      </div>
      <Card className="mt-10 p-8 text-center">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-stone-500">{body}</p>
        {ctaHref && ctaLabel ? (
          <Link
            href={ctaHref}
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 font-medium text-white shadow-sm transition-all duration-150 hover:bg-emerald-500 hover:shadow-md"
          >
            {ctaLabel} <span aria-hidden>→</span>
          </Link>
        ) : null}
      </Card>
    </PageShell>
  );
}

export default async function InviteClaim({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;

  const invite = await getInviteByToken(token);

  if (!invite) {
    return (
      <Message
        title="Invalid link"
        body="This invite link isn't recognized. Ask your host to send a new one."
      />
    );
  }

  if (sp.done || invite.state === "accepted") {
    return (
      <Message
        title="All set — thank you!"
        body={`Your details are with ${invite.organizationName}.${
          invite.event ? ` See you at ${invite.event.title}.` : ""
        } Want to see your readings and events? Sign in with the email you just confirmed.`}
        ctaHref="/sign-in?to=me"
        ctaLabel="See my data"
      />
    );
  }

  if (invite.state === "expired") {
    return (
      <Message
        title="Link expired"
        body="This invite link has expired. Ask your host to send a fresh one."
      />
    );
  }

  const parsedQuestions = formQuestionsSchema.safeParse(invite.questions);
  const questions = await withDocumentUrls(
    parsedQuestions.success ? parsedQuestions.data : [],
  );

  async function accept(formData: FormData) {
    "use server";
    const invite = await getInviteByToken(token);
    if (!invite || invite.state !== "active") redirect(`/i/${token}`);

    const parsed = acceptInviteSchema.safeParse({
      email: (formData.get("email") as string) || undefined,
      phone: (formData.get("phone") as string) || undefined,
      answers: buildAnswers(invite.questions, formData),
    });
    if (!parsed.success) return;

    await acceptInvite(token, parsed.data);
    redirect(`/i/${token}?done=1`);
  }

  return (
    <PageShell width="max-w-md">
      <div className="flex justify-center">
        <Brand />
      </div>

      <Card className="mt-10 p-6 sm:p-8">
        <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
          {invite.organizationName}
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
          Hi {invite.participant.firstName} 👋
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          {invite.event
            ? `You're registered for ${invite.event.title} — ${formatDateTime(
                invite.event.startsAt,
                invite.event.timezone,
              )}${invite.event.location ? `, ${invite.event.location}` : ""}.`
            : "Your host asked you to confirm your details."}{" "}
          Please confirm your contact info
          {questions.length > 0 ? " and answer a few questions" : ""}.
        </p>

        <form action={accept} className="mt-6 space-y-4">
          <Input
            name="email"
            type="email"
            placeholder="Email"
            defaultValue={invite.participant.email ?? ""}
          />
          <Input
            name="phone"
            type="tel"
            placeholder="Phone (optional)"
            defaultValue={invite.participant.phone ?? ""}
          />

          {questions.length > 0 ? (
            <div className="space-y-4 border-t border-stone-100 pt-4">
              <QuestionFields questions={questions} />
            </div>
          ) : null}

          <Button variant="accent" className="w-full py-3">
            Confirm
          </Button>
          <p className="text-center text-xs text-stone-400">
            By confirming you consent to {invite.organizationName} storing the
            information you provide.
          </p>
        </form>
      </Card>
    </PageShell>
  );
}
