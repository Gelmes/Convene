"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  checkinOpSchema,
  paidOpSchema,
  participantOpSchema,
  readingOpSchema,
  type SyncOp,
} from "@convene/schemas";
import { enqueueOp, flushOutbox, outboxDb } from "@/lib/outbox";
import { Button, Card, Input } from "@/components/ui";
import { Rollout } from "@/components/rollout";

export interface RosterEntry {
  participantId: string;
  firstName: string;
  lastName: string | null;
  status: string; // EventRegistration status (REGISTERED, CHECKED_IN, …)
  paid: boolean; // host-confirmed payment (Mode A)
  latest: {
    systolic: number;
    diastolic: number;
    pulse: number | null;
    takenAt: string; // ISO
  } | null;
}

/**
 * Offline-first capture UI. Every action writes to the local outbox first
 * (IndexedDB) and paints optimistically; a background flush pushes ops to the
 * server whenever the network allows and then refreshes server data.
 */
export function FieldCapture({
  orgId,
  eventId,
  roster,
  priced = false,
}: {
  orgId: string;
  eventId: string;
  roster: RosterEntry[];
  priced?: boolean;
}) {
  const router = useRouter();
  const [online, setOnline] = useState(true);
  const flushing = useRef(false);

  // Session-local copy of every op made on this page. The outbox row is
  // deleted the moment the server confirms it — BEFORE the refreshed server
  // data arrives — so overlays driven only by the outbox would blink off for a
  // moment. These stick around; the server data converges to the same values.
  const [applied, setApplied] = useState<SyncOp[]>([]);

  // Pending ops for this org (live view over IndexedDB).
  const pendingRows = useLiveQuery(
    () => outboxDb.outbox.where("orgId").equals(orgId).sortBy("seq"),
    [orgId],
  );
  const pending = pendingRows ?? [];

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      const confirmed = await flushOutbox(orgId);
      if (confirmed > 0) router.refresh();
    } finally {
      flushing.current = false;
    }
  }, [orgId, router]);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => {
      setOnline(true);
      void flush();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    void flush(); // drain anything left from a previous visit
    const interval = setInterval(() => void flush(), 30_000);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      clearInterval(interval);
    };
  }, [flush]);

  // ---- Merge server state with local ops -----------------------------------
  // pendingEventOps: still unsynced (drives the "syncing" indicator).
  // overlayOps: pending + already-applied (drives data overlays, gap-free).
  const pendingEventOps = pending
    .filter((r) => r.eventId === eventId)
    .map((r) => r.op);
  const eventOps = [
    ...pendingEventOps,
    ...applied.filter((op) => op.eventId === eventId),
  ];

  const mergedRoster: RosterEntry[] = [...roster];
  for (const op of eventOps) {
    if (op.kind === "participant" && !mergedRoster.some((p) => p.participantId === op.id)) {
      mergedRoster.push({
        participantId: op.id,
        firstName: op.firstName,
        lastName: op.lastName ?? null,
        status: "REGISTERED",
        paid: false,
        latest: null,
      });
    }
  }

  // Checked-in = server status, plus any pending offline check-in ops.
  const checkedIn = new Set(
    mergedRoster
      .filter((p) => p.status === "CHECKED_IN" || p.status === "ATTENDED")
      .map((p) => p.participantId),
  );
  for (const op of eventOps) {
    if (op.kind === "checkin") checkedIn.add(op.participantId);
  }

  // Paid = server value overridden by local paid ops (last one wins).
  const paidOverride = new Map<string, boolean>();
  for (const op of eventOps) {
    if (op.kind === "paid") paidOverride.set(op.participantId, op.paid);
  }
  const isPaid = (p: RosterEntry) =>
    paidOverride.get(p.participantId) ?? p.paid;
  const paidCount = mergedRoster.filter(isPaid).length;
  const latestByParticipant = new Map<string, RosterEntry["latest"]>();
  for (const entry of mergedRoster) {
    latestByParticipant.set(entry.participantId, entry.latest);
  }
  for (const op of eventOps) {
    if (op.kind !== "reading") continue;
    const current = latestByParticipant.get(op.participantId);
    const opTakenAt =
      op.takenAt instanceof Date ? op.takenAt.toISOString() : String(op.takenAt);
    if (!current || opTakenAt >= current.takenAt) {
      latestByParticipant.set(op.participantId, {
        systolic: op.systolic,
        diastolic: op.diastolic,
        pulse: op.pulse ?? null,
        takenAt: opTakenAt,
      });
    }
  }

  // ---- Actions -------------------------------------------------------------
  async function addParticipant(form: HTMLFormElement) {
    const data = new FormData(form);
    const parsed = participantOpSchema.safeParse({
      kind: "participant",
      id: crypto.randomUUID(),
      eventId,
      firstName: data.get("firstName"),
      lastName: (data.get("lastName") as string) || undefined,
    });
    if (!parsed.success) return;
    setApplied((a) => [...a, parsed.data]);
    await enqueueOp(orgId, parsed.data);
    form.reset();
    void flush();
  }

  async function checkIn(participantId: string) {
    const parsed = checkinOpSchema.safeParse({
      kind: "checkin",
      id: crypto.randomUUID(),
      eventId,
      participantId,
    });
    if (!parsed.success) return;
    setApplied((a) => [...a, parsed.data]);
    await enqueueOp(orgId, parsed.data);
    void flush();
  }

  async function togglePaid(participantId: string, paid: boolean) {
    const parsed = paidOpSchema.safeParse({
      kind: "paid",
      id: crypto.randomUUID(),
      eventId,
      participantId,
      paid,
    });
    if (!parsed.success) return;
    setApplied((a) => [...a, parsed.data]);
    await enqueueOp(orgId, parsed.data);
    void flush();
  }

  async function saveReading(form: HTMLFormElement, participantId: string) {
    const data = new FormData(form);
    const parsed = readingOpSchema.safeParse({
      kind: "reading",
      id: crypto.randomUUID(),
      eventId,
      participantId,
      systolic: data.get("systolic"),
      diastolic: data.get("diastolic"),
      pulse: (data.get("pulse") as string) || undefined,
      note: (data.get("note") as string) || undefined,
      takenAt: new Date(),
    });
    if (!parsed.success) return;
    setApplied((a) => [...a, parsed.data]);
    await enqueueOp(orgId, parsed.data);
    form.reset();
    form.closest("details")?.removeAttribute("open");
    void flush();
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  return (
    <>
      {/* Status strip: connectivity + pending sync */}
      <div className="mt-4 flex items-center gap-2 text-xs font-medium">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ring-1 ring-inset ${
            online
              ? "bg-emerald-50 text-emerald-700 ring-emerald-600/10"
              : "bg-amber-50 text-amber-700 ring-amber-600/20"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${online ? "bg-emerald-500" : "bg-amber-500"}`}
          />
          {online ? "Online" : "Offline — capturing locally"}
        </span>
        {priced ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 ring-1 ring-inset ring-emerald-600/10">
            $ {paidCount}/{mergedRoster.length} paid
          </span>
        ) : null}
        {pending.length > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-2.5 py-1 text-stone-600 ring-1 ring-inset ring-stone-200">
            {pending.length} pending sync
          </span>
        ) : null}
      </div>
      {(() => {
        const failed = pending.find((r) => r.lastError);
        return failed ? (
          <p className="mt-2 text-xs text-amber-700">
            ⚠ Sync issue: {failed.lastError}
          </p>
        ) : null;
      })()}

      <div className="mt-6">
        <Rollout
          heading={
            <h2 className="text-lg font-semibold">
              Participants{" "}
              <span className="font-normal text-stone-400">
                ({mergedRoster.length})
              </span>
            </h2>
          }
          label="+ Add people"
          accent
        >
          <Card className="p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void addParticipant(e.currentTarget);
              }}
              className="space-y-3"
            >
              <div className="flex gap-2">
                <Input name="firstName" required placeholder="First name" />
                <Input name="lastName" placeholder="Last name" />
              </div>
              <Button type="submit" className="w-full">
                Add to event
              </Button>
            </form>
          </Card>
        </Rollout>
      </div>

      <ul className="mt-3 space-y-3">
        {mergedRoster.length === 0 ? (
          <li>
            <Card className="p-6 text-center text-stone-500">
              No participants yet — tap “+ Add people” to add someone.
            </Card>
          </li>
        ) : (
          mergedRoster.map((p) => {
            const last = latestByParticipant.get(p.participantId);
            const isLocal = pendingEventOps.some(
              (op) => op.kind === "participant" && op.id === p.participantId,
            );
            return (
              <li key={p.participantId}>
                <Card className="overflow-hidden">
                  <details className="group">
                    <summary className="flex cursor-pointer select-none items-center justify-between p-4 transition-colors hover:bg-stone-50">
                      <span className="flex items-center gap-2 font-medium text-stone-900">
                        {p.firstName} {p.lastName ?? ""}
                        {checkedIn.has(p.participantId) ? (
                          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-600/10">
                            ✓ In
                          </span>
                        ) : null}
                        {priced ? (
                          isPaid(p) ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/10">
                              $ paid
                            </span>
                          ) : (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                              $ due
                            </span>
                          )
                        ) : null}
                        {isLocal ? (
                          <span className="text-xs font-normal text-amber-600">
                            ⟳ syncing
                          </span>
                        ) : null}
                      </span>
                      {last ? (
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium tabular-nums text-emerald-700 ring-1 ring-inset ring-emerald-600/10">
                          {last.systolic}/{last.diastolic}
                          {last.pulse ? (
                            <span className="text-emerald-600/70"> · {last.pulse}</span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-sm font-medium text-stone-400 transition-colors group-hover:text-emerald-700">
                          Take BP →
                        </span>
                      )}
                    </summary>

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void saveReading(e.currentTarget, p.participantId);
                      }}
                      className="space-y-3 border-t border-stone-100 bg-stone-50/50 p-4"
                    >
                      {!checkedIn.has(p.participantId) || priced ? (
                        <div className="flex gap-2">
                          {!checkedIn.has(p.participantId) ? (
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => void checkIn(p.participantId)}
                              className="flex-1 border border-dashed border-sky-300 bg-sky-50/50 text-sky-700 hover:bg-sky-100 hover:text-sky-800"
                            >
                              ✓ Check in
                            </Button>
                          ) : null}
                          {priced ? (
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() =>
                                void togglePaid(p.participantId, !isPaid(p))
                              }
                              className={
                                isPaid(p)
                                  ? "flex-1 border border-stone-200 text-stone-500 hover:bg-stone-100"
                                  : "flex-1 border border-dashed border-emerald-300 bg-emerald-50/50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800"
                              }
                            >
                              {isPaid(p) ? "Mark unpaid" : "$ Mark paid"}
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="flex gap-2">
                        <label className="flex-1 text-xs font-medium text-stone-500">
                          Systolic
                          <Input
                            name="systolic"
                            type="number"
                            inputMode="numeric"
                            required
                            placeholder="120"
                            className="mt-1.5 py-3 text-center text-lg font-semibold tabular-nums"
                          />
                        </label>
                        <label className="flex-1 text-xs font-medium text-stone-500">
                          Diastolic
                          <Input
                            name="diastolic"
                            type="number"
                            inputMode="numeric"
                            required
                            placeholder="80"
                            className="mt-1.5 py-3 text-center text-lg font-semibold tabular-nums"
                          />
                        </label>
                        <label className="flex-1 text-xs font-medium text-stone-500">
                          Pulse
                          <Input
                            name="pulse"
                            type="number"
                            inputMode="numeric"
                            placeholder="72"
                            className="mt-1.5 py-3 text-center text-lg font-semibold tabular-nums"
                          />
                        </label>
                      </div>
                      <Input name="note" placeholder="Note (optional)" />
                      <Button type="submit" variant="accent" className="w-full py-3">
                        Save reading
                      </Button>
                      <div className="flex items-center justify-between text-xs">
                        <Link
                          href={`/o/${orgId}/p/${p.participantId}`}
                          className="font-medium text-stone-500 underline-offset-2 transition-colors hover:text-emerald-700 hover:underline"
                        >
                          History &amp; intake →
                        </Link>
                        {last ? (
                          <span className="text-stone-400">
                            Last: {last.systolic}/{last.diastolic} at {fmt(last.takenAt)}
                          </span>
                        ) : null}
                      </div>
                    </form>
                  </details>
                </Card>
              </li>
            );
          })
        )}
      </ul>

    </>
  );
}
