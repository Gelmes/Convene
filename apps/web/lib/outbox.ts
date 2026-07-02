"use client";

import Dexie, { type EntityTable } from "dexie";
import type { SyncOp } from "@convene/schemas";

/**
 * Device-local outbox. Captures (participants, readings) are written here
 * first, then flushed to /api/o/[orgId]/sync when the network allows. Rows are
 * deleted only after the server confirms the op — so nothing is lost if the
 * phone dies, the tab closes, or the venue has no signal.
 */

export interface OutboxRow {
  id: string; // op id (client-generated UUID, doubles as idempotency key)
  orgId: string;
  eventId: string;
  seq: number; // preserves enqueue order (participants before their readings)
  op: SyncOp;
  attempts: number;
  lastError?: string;
  createdAt: string;
}

const dexie = new Dexie("convene-field") as Dexie & {
  outbox: EntityTable<OutboxRow, "id">;
};

dexie.version(1).stores({
  outbox: "id, orgId, eventId, seq",
});

export const outboxDb = dexie;

let seqCounter = Date.now();

export async function enqueueOp(orgId: string, op: SyncOp): Promise<void> {
  await dexie.outbox.add({
    id: op.id,
    orgId,
    eventId: op.eventId,
    seq: seqCounter++,
    op,
    attempts: 0,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Push all pending ops for an org to the server. Returns the number of ops
 * confirmed. Safe to call repeatedly — ops are idempotent server-side.
 */
export async function flushOutbox(orgId: string): Promise<number> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return 0;

  const rows = await dexie.outbox.where("orgId").equals(orgId).sortBy("seq");
  if (rows.length === 0) return 0;

  let confirmed = 0;
  // Batch in chunks to stay under the server's 200-op limit.
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    let results: Array<{ id: string; status: string; message?: string }>;
    try {
      const res = await fetch(`/api/o/${orgId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ops: chunk.map((r) => r.op) }),
      });
      if (!res.ok) throw new Error(`sync failed: ${res.status}`);
      ({ results } = (await res.json()) as { results: typeof results });
    } catch {
      // Network/server failure — bump attempts and stop; we'll retry later.
      await Promise.all(
        chunk.map((r) =>
          dexie.outbox.update(r.id, { attempts: r.attempts + 1 }),
        ),
      );
      break;
    }

    for (const result of results) {
      if (result.status === "done") {
        await dexie.outbox.delete(result.id);
        confirmed++;
      } else {
        const row = chunk.find((r) => r.id === result.id);
        await dexie.outbox.update(result.id, {
          attempts: (row?.attempts ?? 0) + 1,
          lastError: result.message,
        });
      }
    }
  }
  return confirmed;
}
