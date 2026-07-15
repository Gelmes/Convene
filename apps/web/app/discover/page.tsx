import { listPublicEvents } from "@convene/db";
import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import { r2Configured, r2PresignGet } from "@/lib/r2";
import { Badge, Brand, Card, Input, LinkButton, PageShell } from "@/components/ui";

export const metadata = {
  title: "Discover events — Vitalgather",
  description: "Browse and search upcoming events from hosts on Vitalgather.",
};

// The directory reflects live registrations, so don't cache it.
export const dynamic = "force-dynamic";

export default async function Discover({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const sort = sp.sort === "popular" ? "popular" : "soon";

  const events = await listPublicEvents({ q, sort });

  // Presign card thumbnails (only events that have one).
  const thumbs = new Map<string, string>();
  if (r2Configured()) {
    await Promise.all(
      events
        .filter((e) => e.imageThumbKey)
        .map(async (e) => {
          thumbs.set(e.id, await r2PresignGet(e.imageThumbKey!));
        }),
    );
  }

  // Sort links preserve the current search query.
  const sortHref = (s: "soon" | "popular") => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (s === "popular") params.set("sort", "popular");
    const qs = params.toString();
    return qs ? `/discover?${qs}` : "/discover";
  };

  const sortTab = (s: "soon" | "popular", label: string) => (
    <Link
      href={sortHref(s)}
      aria-current={sort === s ? "page" : undefined}
      className={`rounded-xl px-3 py-1.5 text-sm font-medium transition-all duration-150 ${
        sort === s
          ? "bg-white text-stone-900 shadow-sm"
          : "text-stone-500 hover:text-stone-800"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <PageShell width="max-w-4xl">
      <div className="flex items-center justify-between">
        <Link href="/">
          <Brand />
        </Link>
        <LinkButton href="/sign-in" variant="ghost" className="px-3 py-1.5 text-sm">
          Host sign in
        </LinkButton>
      </div>

      <div className="mt-10">
        <h1 className="text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl">
          Discover events
        </h1>
        <p className="mt-2 max-w-xl text-stone-500">
          Breathwork, ceremonies, sauna and more — browse upcoming events and
          register in a tap.
        </p>
      </div>

      {/* Search + sort */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <form action="/discover" className="flex flex-1 gap-2">
          {sort === "popular" ? (
            <input type="hidden" name="sort" value="popular" />
          ) : null}
          <Input
            name="q"
            type="search"
            defaultValue={q ?? ""}
            placeholder="Search events, hosts, places…"
            className="flex-1"
            aria-label="Search events"
          />
          <button
            className="shrink-0 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-stone-700"
          >
            Search
          </button>
        </form>
        <div className="flex gap-1 rounded-2xl bg-stone-200/50 p-1">
          {sortTab("soon", "Soonest")}
          {sortTab("popular", "Popular")}
        </div>
      </div>

      {/* Results */}
      {events.length === 0 ? (
        <Card className="mt-8 p-10 text-center text-stone-500">
          {q ? (
            <>
              No events match <span className="font-medium">“{q}”</span>. Try a
              broader search.
            </>
          ) : (
            <>No public events are listed right now — check back soon.</>
          )}
        </Card>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {events.map((e) => (
            <li key={e.id}>
              <Link href={`/r/${e.id}`} className="group block h-full">
                <Card className="flex h-full flex-col overflow-hidden transition-all duration-150 group-hover:-translate-y-0.5 group-hover:shadow-md">
                  {thumbs.has(e.id) ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={thumbs.get(e.id)}
                      alt=""
                      className="aspect-[16/9] w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-[16/9] w-full items-center justify-center bg-gradient-to-br from-stone-100 to-emerald-50 text-2xl text-emerald-700/40">
                      <Brand className="opacity-30" />
                    </div>
                  )}
                  <div className="flex flex-1 flex-col p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
                      {e.organizationName}
                    </p>
                    <h3 className="mt-1 line-clamp-2 font-semibold tracking-tight text-stone-900">
                      {e.title}
                    </h3>
                    <p className="mt-1 text-sm text-stone-500">
                      {formatDateTime(e.startsAt, e.timezone)}
                      {e.location ? ` · ${e.location}` : ""}
                    </p>
                    <div className="mt-3 flex items-center gap-2 pt-1">
                      <Badge>
                        {e.priceCents
                          ? `$${(e.priceCents / 100).toFixed(2).replace(/\.00$/, "")}`
                          : "Free"}
                      </Badge>
                      {e.registrationCount > 0 ? (
                        <Badge>{e.registrationCount} going</Badge>
                      ) : null}
                    </div>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
