import { getPublicEvent, LimitError, registerForEventPublic } from "@convene/db";
import { formQuestionsSchema, publicRegistrationSchema } from "@convene/schemas";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buildAnswers } from "@/lib/forms";
import { formatDateTime } from "@/lib/format";
import { Brand, Button, Card, Input, PageShell } from "@/components/ui";
import { QuestionFields } from "@/components/question-fields";

export default async function PublicRegistration({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ done?: string; full?: string }>;
}) {
  const { eventId } = await params;
  const sp = await searchParams;

  const event = await getPublicEvent(eventId);

  if (!event) {
    return (
      <PageShell width="max-w-md">
        <div className="flex justify-center">
          <Brand />
        </div>
        <Card className="mt-10 p-8 text-center">
          <h1 className="text-xl font-semibold">Registration closed</h1>
          <p className="mt-2 text-sm text-stone-500">
            This event isn&apos;t open for public registration. Check with your
            host for the right link.
          </p>
        </Card>
      </PageShell>
    );
  }

  if (sp.full) {
    return (
      <PageShell width="max-w-md">
        <div className="flex justify-center">
          <Brand />
        </div>
        <Card className="mt-10 p-8 text-center">
          <h1 className="text-xl font-semibold">Registration is full</h1>
          <p className="mt-2 text-sm text-stone-500">
            This event can&apos;t accept more registrations right now. Please
            check with your host.
          </p>
        </Card>
      </PageShell>
    );
  }

  if (sp.done) {
    return (
      <PageShell width="max-w-md">
        <div className="flex justify-center">
          <Brand />
        </div>
        <Card className="mt-10 p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl">
            ✓
          </div>
          <h1 className="mt-4 text-xl font-semibold">You&apos;re registered!</h1>
          <p className="mt-2 text-sm text-stone-500">
            See you at {event.title} — {formatDateTime(event.startsAt)}
            {event.location ? `, ${event.location}` : ""}. If you provided an
            email, you can sign in with it anytime to see your data.
          </p>
          {event.priceCents ? (
            <div className="mt-5 rounded-xl bg-amber-50 p-4 text-left ring-1 ring-inset ring-amber-600/20">
              <p className="text-sm font-semibold text-amber-800">
                One more step — payment: $
                {(event.priceCents / 100).toFixed(2).replace(/\.00$/, "")}
              </p>
              {event.paymentInstructions ? (
                <p className="mt-1 text-sm leading-relaxed text-amber-800/90">
                  {event.paymentInstructions}
                </p>
              ) : null}
              {event.paymentLink ? (
                <a
                  href={event.paymentLink}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-stone-700"
                >
                  Pay now <span aria-hidden>↗</span>
                </a>
              ) : null}
            </div>
          ) : null}
          <Link
            href="/sign-in?to=me"
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 font-medium text-white shadow-sm transition-all duration-150 hover:bg-emerald-500 hover:shadow-md"
          >
            See my data <span aria-hidden>→</span>
          </Link>
        </Card>
      </PageShell>
    );
  }

  const questions = formQuestionsSchema.safeParse(event.questions).success
    ? event.questions
    : [];

  async function register(formData: FormData) {
    "use server";
    const event = await getPublicEvent(eventId);
    if (!event) redirect(`/r/${eventId}`);

    const parsed = publicRegistrationSchema.safeParse({
      firstName: formData.get("firstName"),
      lastName: (formData.get("lastName") as string) || undefined,
      email: (formData.get("email") as string) || undefined,
      answers: buildAnswers(event.questions, formData),
    });
    if (!parsed.success) return;

    try {
      await registerForEventPublic(eventId, parsed.data);
    } catch (err) {
      if (err instanceof LimitError) redirect(`/r/${eventId}?full=1`);
      throw err;
    }
    redirect(`/r/${eventId}?done=1`);
  }

  return (
    <PageShell width="max-w-md">
      <div className="flex justify-center">
        <Brand />
      </div>

      <Card className="mt-10 p-6 sm:p-8">
        <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
          {event.organization.name}
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">{event.title}</h1>
        <p className="mt-1 text-sm text-stone-500">
          {formatDateTime(event.startsAt)}
          {event.location ? ` · ${event.location}` : ""}
          {event.priceCents ? (
            <span className="ml-2 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/10">
              ${(event.priceCents / 100).toFixed(2).replace(/\.00$/, "")}
            </span>
          ) : null}
        </p>
        {event.description ? (
          <p className="mt-3 text-sm leading-relaxed text-stone-600">
            {event.description}
          </p>
        ) : null}

        <form action={register} className="mt-6 space-y-4">
          <div className="flex gap-2">
            <Input name="firstName" required placeholder="First name" />
            <Input name="lastName" placeholder="Last name" />
          </div>
          <Input name="email" type="email" placeholder="Email (optional)" />

          {questions.length > 0 ? (
            <div className="space-y-4 border-t border-stone-100 pt-4">
              <QuestionFields questions={questions} />
            </div>
          ) : null}

          <Button variant="accent" className="w-full py-3">
            Register
          </Button>
          <p className="text-center text-xs text-stone-400">
            By registering you consent to {event.organization.name} storing the
            information you provide.
          </p>
        </form>
      </Card>
    </PageShell>
  );
}
