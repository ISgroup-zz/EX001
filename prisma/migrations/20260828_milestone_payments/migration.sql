-- CreateEnum
CREATE TYPE "PaymentBasis" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "PlanChangeAction" AS ENUM ('PLAN_CREATED', 'MILESTONE_ADDED', 'MILESTONE_UPDATED', 'MILESTONE_CANCELLED', 'PAYMENT_RECORDED');

-- AlterTable
ALTER TABLE "DeliveryPlanItem" ADD COLUMN     "paymentAmountMinor" INTEGER,
ADD COLUMN     "paymentBasis" "PaymentBasis" NOT NULL DEFAULT 'PERCENTAGE',
ADD COLUMN     "paymentDueDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paymentPercent" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "VendorPayment" (
    "id" TEXT NOT NULL,
    "planItemId" TEXT NOT NULL,
    "vendorPoId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "paidDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryPlanChange" (
    "id" TEXT NOT NULL,
    "vendorPoId" TEXT NOT NULL,
    "planItemId" TEXT,
    "action" "PlanChangeAction" NOT NULL,
    "field" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "summary" TEXT NOT NULL,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryPlanChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorPayment_planItemId_idx" ON "VendorPayment"("planItemId");

-- CreateIndex
CREATE INDEX "VendorPayment_vendorPoId_idx" ON "VendorPayment"("vendorPoId");

-- CreateIndex
CREATE INDEX "VendorPayment_paidDate_idx" ON "VendorPayment"("paidDate");

-- CreateIndex
CREATE INDEX "DeliveryPlanChange_vendorPoId_createdAt_idx" ON "DeliveryPlanChange"("vendorPoId", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryPlanChange_planItemId_idx" ON "DeliveryPlanChange"("planItemId");

-- AddForeignKey
ALTER TABLE "VendorPayment" ADD CONSTRAINT "VendorPayment_planItemId_fkey" FOREIGN KEY ("planItemId") REFERENCES "DeliveryPlanItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPayment" ADD CONSTRAINT "VendorPayment_vendorPoId_fkey" FOREIGN KEY ("vendorPoId") REFERENCES "VendorPO"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPayment" ADD CONSTRAINT "VendorPayment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryPlanChange" ADD CONSTRAINT "DeliveryPlanChange_vendorPoId_fkey" FOREIGN KEY ("vendorPoId") REFERENCES "VendorPO"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryPlanChange" ADD CONSTRAINT "DeliveryPlanChange_planItemId_fkey" FOREIGN KEY ("planItemId") REFERENCES "DeliveryPlanItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryPlanChange" ADD CONSTRAINT "DeliveryPlanChange_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

