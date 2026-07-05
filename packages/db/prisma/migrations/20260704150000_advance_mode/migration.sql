-- CreateEnum
CREATE TYPE "AdvanceMode" AS ENUM ('MANUAL', 'AUTO');

-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "advanceMode" "AdvanceMode" NOT NULL DEFAULT 'MANUAL';

