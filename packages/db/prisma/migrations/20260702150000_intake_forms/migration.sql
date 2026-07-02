-- CreateEnum
CREATE TYPE "FormStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FilledBy" AS ENUM ('PARTICIPANT', 'HOST');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "intakeFormTemplateId" TEXT,
ADD COLUMN     "publicRegistration" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "FormTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "FormStatus" NOT NULL DEFAULT 'DRAFT',
    "questions" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormSubmission" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "formTemplateId" TEXT NOT NULL,
    "formVersion" INTEGER NOT NULL,
    "participantId" TEXT NOT NULL,
    "eventId" TEXT,
    "filledBy" "FilledBy" NOT NULL,
    "submittedByUserId" TEXT,
    "answers" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FormTemplate_organizationId_idx" ON "FormTemplate"("organizationId");

-- CreateIndex
CREATE INDEX "FormSubmission_organizationId_idx" ON "FormSubmission"("organizationId");

-- CreateIndex
CREATE INDEX "FormSubmission_participantId_idx" ON "FormSubmission"("participantId");

-- CreateIndex
CREATE INDEX "FormSubmission_formTemplateId_idx" ON "FormSubmission"("formTemplateId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_intakeFormTemplateId_fkey" FOREIGN KEY ("intakeFormTemplateId") REFERENCES "FormTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormTemplate" ADD CONSTRAINT "FormTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_formTemplateId_fkey" FOREIGN KEY ("formTemplateId") REFERENCES "FormTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

