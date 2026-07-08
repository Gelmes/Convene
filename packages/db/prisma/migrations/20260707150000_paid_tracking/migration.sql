-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "paymentInstructions" TEXT,
ADD COLUMN     "paymentLink" TEXT,
ADD COLUMN     "priceCents" INTEGER;

-- AlterTable
ALTER TABLE "EventRegistration" ADD COLUMN     "paidAt" TIMESTAMP(3);

