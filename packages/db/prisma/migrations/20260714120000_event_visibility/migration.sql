-- CreateEnum
CREATE TYPE "EventVisibility" AS ENUM ('CLOSED', 'UNLISTED', 'LISTED');

-- AlterTable: add the visibility column (defaults to CLOSED for new rows)
ALTER TABLE "Event" ADD COLUMN     "visibility" "EventVisibility" NOT NULL DEFAULT 'CLOSED';

-- Preserve existing behavior: events that had public registration on become
-- UNLISTED (registerable via the shared link, but not in the new directory).
UPDATE "Event" SET "visibility" = 'UNLISTED' WHERE "publicRegistration" = true;

-- Drop the old boolean now that its meaning lives in the enum.
ALTER TABLE "Event" DROP COLUMN "publicRegistration";

-- CreateIndex
CREATE INDEX "Event_visibility_startsAt_idx" ON "Event"("visibility", "startsAt");
