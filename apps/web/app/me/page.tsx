import { auth } from "@convene/auth";
import { getPortalData } from "@convene/db";
import { formAnswersSchema } from "@convene/schemas";
import { redirect } from "next/navigation";
import { formatDateTime } from "@/lib/format";
import { r2Configured, r2PresignGet } from "@/lib/r2";
import { Badge, Brand, Card, LinkButton, PageShell } from "@/components/ui";

const STATUS_LABELS: Record<string, string> = {
  REGISTERED: "Registered",
  CHECKED_IN: "Checked in",
  ATTENDED: "Attended",
  NO_SHOW: "No-show",
};

export default async function Portal() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/sign-in");

  const profiles = await getPortalData(userId, session?.user?.email);

  // Presign photo URLs for every attended event (bucket is private).
  const photoUrls = new Map<string, string>();
  if (r2Configured()) {
    const keys = profiles.flatMap((p) =>
      p.registrations.flatMap((reg) => reg.event.photos.map((ph) => ph.storageKey)),
    );
    await Promise.all(
      keys.map(async (key) => {
        photoUrls.set(key, await r2PresignGet(key));
      }),
    );
  }

  return (
    <PageShell>
      <div className="flex items-center justify-between">
        <a href="/">
          <Brand />
        </a>
        <LinkButton href="/dashboard" variant="ghost" className="px-3 py-1.5 text-sm">
          Host dashboard
        </LinkButton>
      </div>

      <div className="mt-10">
        <h1 className="text-2xl font-bold tracking-tight">My participation</h1>
        <p className="mt-1 text-sm text-stone-500">
          Your events, readings, and intake — signed in as {session?.user?.email}
        </p>
      </div>

      {profiles.length === 0 ? (
        <Card className="mt-6 p-8 text-center">
          <h2 className="font-semibold">Nothing here yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-stone-500">
            When a host records you at an event with this email address —{" "}
            {session?.user?.email} — your data appears here automatically. If
            you received an invite link, open it and confirm this email.
          </p>
        </Card>
      ) : (
        profiles.map((p) => (
          <section key={p.id} className="mt-8">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{p.organization.name}</h2>
              <Badge>
                {p.firstName} {p.lastName ?? ""}
              </Badge>
            </div>

            {/* Events */}
            <Card className="mt-3 p-4">
              <h3 className="text-sm font-medium text-stone-500">Events</h3>
              {p.registrations.length === 0 ? (
                <p className="mt-2 text-sm text-stone-400">No events yet.</p>
              ) : (
                <ul className="mt-2 divide-y divide-stone-100">
                  {p.registrations.map((reg) => (
                    <li key={reg.id} className="py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-stone-900">
                            {reg.event.title}
                          </span>
                          <span className="text-sm text-stone-500">
                            {formatDateTime(reg.event.startsAt)}
                            {reg.event.location ? ` · ${reg.event.location}` : ""}
                          </span>
                        </span>
                        <Badge>{STATUS_LABELS[reg.status] ?? reg.status}</Badge>
                      </div>
                      {reg.event.photos.length > 0 ? (
                        <div className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                          {reg.event.photos.map((ph) => {
                            const url = photoUrls.get(ph.storageKey);
                            if (!url) return null;
                            return (
                              <a
                                key={ph.id}
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="block aspect-square overflow-hidden rounded-lg"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={url}
                                  alt={ph.caption ?? "Event photo"}
                                  loading="lazy"
                                  className="h-full w-full object-cover transition-transform duration-200 hover:scale-105"
                                />
                              </a>
                            );
                          })}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Blood pressure */}
            <Card className="mt-3 p-4">
              <h3 className="text-sm font-medium text-stone-500">
                Blood pressure history
              </h3>
              {p.healthReadings.length === 0 ? (
                <p className="mt-2 text-sm text-stone-400">No readings yet.</p>
              ) : (
                <ul className="mt-2 divide-y divide-stone-100">
                  {p.healthReadings.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between gap-3 py-2.5"
                    >
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium tabular-nums text-emerald-700 ring-1 ring-inset ring-emerald-600/10">
                        {r.systolic}/{r.diastolic}
                        {r.pulse ? (
                          <span className="text-emerald-600/70"> · {r.pulse}</span>
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1 truncate px-3 text-sm text-stone-500">
                        {r.note ?? ""}
                      </span>
                      <span className="shrink-0 text-xs text-stone-400">
                        {formatDateTime(r.takenAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Intake */}
            {p.formSubmissions.length > 0 ? (
              <Card className="mt-3 p-4">
                <h3 className="text-sm font-medium text-stone-500">My intake</h3>
                <ul className="mt-2 space-y-2">
                  {p.formSubmissions.map((s) => {
                    const answers = formAnswersSchema.safeParse(s.answers);
                    return (
                      <li key={s.id} className="rounded-xl border border-stone-100">
                        <details>
                          <summary className="flex cursor-pointer select-none items-center justify-between p-3 text-sm">
                            <span className="font-medium text-stone-800">
                              {s.formTemplate.name}
                            </span>
                            <span className="text-xs text-stone-400">
                              {formatDateTime(s.createdAt)}
                            </span>
                          </summary>
                          <dl className="space-y-2 border-t border-stone-100 p-3">
                            {(answers.success ? answers.data : []).map((a) => (
                              <div key={a.questionId} className="text-sm">
                                <dt className="text-stone-500">{a.label}</dt>
                                <dd className="mt-0.5 font-medium text-stone-900">
                                  {a.value || "—"}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ) : null}
          </section>
        ))
      )}
    </PageShell>
  );
}
