-- CreateEnum
CREATE TYPE "EventKind" AS ENUM ('GROUP', 'ONE_ON_ONE');

-- AlterTable: existing events are all GROUP happenings by default.
ALTER TABLE "Event" ADD COLUMN     "kind" "EventKind" NOT NULL DEFAULT 'GROUP';
