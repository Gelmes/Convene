import { auth } from "@convene/auth";
import { Brand, Card, LinkButton, PageShell } from "@/components/ui";

const features = [
  {
    title: "Run events",
    body: "Create events and manage your roster from your phone.",
  },
  {
    title: "Capture in seconds",
    body: "Walk up, tap a name, record blood pressure and a note.",
  },
  {
    title: "Private by design",
    body: "Health data is isolated, audited, and encryptable.",
  },
];

export default async function Home() {
  const session = await auth();

  return (
    <PageShell width="max-w-3xl">
      <div className="flex items-center justify-between">
        <Brand />
        <div className="flex items-center gap-1">
          <LinkButton href="/discover" variant="ghost" className="px-3 py-1.5 text-sm">
            Browse events
          </LinkButton>
          {session?.user ? null : (
            <LinkButton href="/sign-in" variant="ghost" className="px-3 py-1.5 text-sm">
              Sign in
            </LinkButton>
          )}
        </div>
      </div>

      <div className="mt-16 sm:mt-24">
        <h1 className="text-4xl font-bold tracking-tight text-stone-900 sm:text-5xl">
          Host events.
          <br />
          <span className="text-emerald-700">Know your participants.</span>
        </h1>
        <p className="mt-4 max-w-lg text-lg leading-relaxed text-stone-500">
          The field companion for facilitators — events, intake, and on-the-spot
          health readings, all in one place.
        </p>

        <div className="mt-8">
          <LinkButton
            href={session?.user ? "/dashboard" : "/sign-in"}
            className="px-6 py-3 text-base"
          >
            {session?.user ? "Go to your dashboard" : "Get started"}
            <span aria-hidden>→</span>
          </LinkButton>
        </div>
      </div>

      <div className="mt-16 grid gap-4 sm:mt-24 sm:grid-cols-3">
        {features.map((f) => (
          <Card key={f.title} className="p-5">
            <h3 className="font-semibold text-stone-900">{f.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-stone-500">{f.body}</p>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}
