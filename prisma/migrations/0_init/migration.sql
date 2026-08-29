-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'PROJECT_MANAGER', 'VIEWER');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ON_HOLD', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgreementType" AS ENUM ('PO', 'CONTRACT', 'FRAMEWORK', 'VARIATION');

-- CreateEnum
CREATE TYPE "AgreementStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXHAUSTED', 'EXPIRED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VendorPOStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryPlanItemStatus" AS ENUM ('PLANNED', 'PARTIAL', 'FULFILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GRNStatus" AS ENUM ('DRAFT', 'POSTED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'PROJECT_MANAGER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "taxId" TEXT,
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 30,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "taxId" TEXT,
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 30,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "clientId" TEXT NOT NULL,
    "managerId" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "originatingAgreementId" TEXT,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientAgreement" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "AgreementType" NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT,
    "status" "AgreementStatus" NOT NULL DEFAULT 'ACTIVE',
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "declaredValueMinor" INTEGER,
    "parentAgreementId" TEXT,
    "documentUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientAgreementLine" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "uom" TEXT NOT NULL DEFAULT 'EA',
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,
    "taxRatePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "ClientAgreementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorPO" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "clientAgreementId" TEXT,
    "poNumber" TEXT NOT NULL,
    "status" "VendorPOStatus" NOT NULL DEFAULT 'DRAFT',
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedDeliveryDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorPO_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorPOLine" (
    "id" TEXT NOT NULL,
    "vendorPoId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "clientAgreementLineId" TEXT,
    "description" TEXT NOT NULL,
    "uom" TEXT NOT NULL DEFAULT 'EA',
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCostMinor" INTEGER NOT NULL,
    "taxRatePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "VendorPOLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryPlanItem" (
    "id" TEXT NOT NULL,
    "vendorPoId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "label" TEXT,
    "plannedDate" TIMESTAMP(3) NOT NULL,
    "status" "DeliveryPlanItemStatus" NOT NULL DEFAULT 'PLANNED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryPlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryPlanLine" (
    "id" TEXT NOT NULL,
    "planItemId" TEXT NOT NULL,
    "vendorPoLineId" TEXT NOT NULL,
    "plannedQuantity" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "DeliveryPlanLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GRN" (
    "id" TEXT NOT NULL,
    "vendorPoId" TEXT NOT NULL,
    "deliveryPlanItemId" TEXT,
    "grnNumber" TEXT NOT NULL,
    "status" "GRNStatus" NOT NULL DEFAULT 'DRAFT',
    "receivedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedById" TEXT,
    "deliveryNoteRef" TEXT,
    "notes" TEXT,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GRN_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GRNLine" (
    "id" TEXT NOT NULL,
    "grnId" TEXT NOT NULL,
    "vendorPoLineId" TEXT NOT NULL,
    "quantityReceived" DOUBLE PRECISION NOT NULL,
    "quantityAccepted" DOUBLE PRECISION NOT NULL,
    "quantityRejected" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remarks" TEXT,

    CONSTRAINT "GRNLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientAgreementId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "subtotalMinor" INTEGER NOT NULL DEFAULT 0,
    "taxTotalMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "clientAgreementLineId" TEXT,
    "lineNo" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "uom" TEXT NOT NULL DEFAULT 'EA',
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,
    "taxRatePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lineTotalMinor" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "paidDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentCounter" (
    "id" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DocumentCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_code_key" ON "Client"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_code_key" ON "Vendor"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Project_originatingAgreementId_key" ON "Project"("originatingAgreementId");

-- CreateIndex
CREATE INDEX "Project_clientId_idx" ON "Project"("clientId");

-- CreateIndex
CREATE INDEX "Project_managerId_idx" ON "Project"("managerId");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "ClientAgreement_projectId_idx" ON "ClientAgreement"("projectId");

-- CreateIndex
CREATE INDEX "ClientAgreement_parentAgreementId_idx" ON "ClientAgreement"("parentAgreementId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientAgreement_projectId_reference_key" ON "ClientAgreement"("projectId", "reference");

-- CreateIndex
CREATE INDEX "ClientAgreementLine_agreementId_idx" ON "ClientAgreementLine"("agreementId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorPO_poNumber_key" ON "VendorPO"("poNumber");

-- CreateIndex
CREATE INDEX "VendorPO_projectId_idx" ON "VendorPO"("projectId");

-- CreateIndex
CREATE INDEX "VendorPO_vendorId_idx" ON "VendorPO"("vendorId");

-- CreateIndex
CREATE INDEX "VendorPO_status_idx" ON "VendorPO"("status");

-- CreateIndex
CREATE INDEX "VendorPOLine_vendorPoId_idx" ON "VendorPOLine"("vendorPoId");

-- CreateIndex
CREATE INDEX "VendorPOLine_clientAgreementLineId_idx" ON "VendorPOLine"("clientAgreementLineId");

-- CreateIndex
CREATE INDEX "DeliveryPlanItem_plannedDate_idx" ON "DeliveryPlanItem"("plannedDate");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryPlanItem_vendorPoId_seq_key" ON "DeliveryPlanItem"("vendorPoId", "seq");

-- CreateIndex
CREATE INDEX "DeliveryPlanLine_vendorPoLineId_idx" ON "DeliveryPlanLine"("vendorPoLineId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryPlanLine_planItemId_vendorPoLineId_key" ON "DeliveryPlanLine"("planItemId", "vendorPoLineId");

-- CreateIndex
CREATE UNIQUE INDEX "GRN_grnNumber_key" ON "GRN"("grnNumber");

-- CreateIndex
CREATE INDEX "GRN_vendorPoId_idx" ON "GRN"("vendorPoId");

-- CreateIndex
CREATE INDEX "GRN_deliveryPlanItemId_idx" ON "GRN"("deliveryPlanItemId");

-- CreateIndex
CREATE INDEX "GRN_status_idx" ON "GRN"("status");

-- CreateIndex
CREATE INDEX "GRNLine_grnId_idx" ON "GRNLine"("grnId");

-- CreateIndex
CREATE INDEX "GRNLine_vendorPoLineId_idx" ON "GRNLine"("vendorPoLineId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_projectId_idx" ON "Invoice"("projectId");

-- CreateIndex
CREATE INDEX "Invoice_clientId_idx" ON "Invoice"("clientId");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceLine_clientAgreementLineId_idx" ON "InvoiceLine"("clientAgreementLineId");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentCounter_prefix_year_key" ON "DocumentCounter"("prefix", "year");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_originatingAgreementId_fkey" FOREIGN KEY ("originatingAgreementId") REFERENCES "ClientAgreement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientAgreement" ADD CONSTRAINT "ClientAgreement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientAgreement" ADD CONSTRAINT "ClientAgreement_parentAgreementId_fkey" FOREIGN KEY ("parentAgreementId") REFERENCES "ClientAgreement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientAgreementLine" ADD CONSTRAINT "ClientAgreementLine_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "ClientAgreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPO" ADD CONSTRAINT "VendorPO_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPO" ADD CONSTRAINT "VendorPO_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPO" ADD CONSTRAINT "VendorPO_clientAgreementId_fkey" FOREIGN KEY ("clientAgreementId") REFERENCES "ClientAgreement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPOLine" ADD CONSTRAINT "VendorPOLine_vendorPoId_fkey" FOREIGN KEY ("vendorPoId") REFERENCES "VendorPO"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPOLine" ADD CONSTRAINT "VendorPOLine_clientAgreementLineId_fkey" FOREIGN KEY ("clientAgreementLineId") REFERENCES "ClientAgreementLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryPlanItem" ADD CONSTRAINT "DeliveryPlanItem_vendorPoId_fkey" FOREIGN KEY ("vendorPoId") REFERENCES "VendorPO"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryPlanLine" ADD CONSTRAINT "DeliveryPlanLine_planItemId_fkey" FOREIGN KEY ("planItemId") REFERENCES "DeliveryPlanItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryPlanLine" ADD CONSTRAINT "DeliveryPlanLine_vendorPoLineId_fkey" FOREIGN KEY ("vendorPoLineId") REFERENCES "VendorPOLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GRN" ADD CONSTRAINT "GRN_vendorPoId_fkey" FOREIGN KEY ("vendorPoId") REFERENCES "VendorPO"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GRN" ADD CONSTRAINT "GRN_deliveryPlanItemId_fkey" FOREIGN KEY ("deliveryPlanItemId") REFERENCES "DeliveryPlanItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GRN" ADD CONSTRAINT "GRN_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GRNLine" ADD CONSTRAINT "GRNLine_grnId_fkey" FOREIGN KEY ("grnId") REFERENCES "GRN"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GRNLine" ADD CONSTRAINT "GRNLine_vendorPoLineId_fkey" FOREIGN KEY ("vendorPoLineId") REFERENCES "VendorPOLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientAgreementId_fkey" FOREIGN KEY ("clientAgreementId") REFERENCES "ClientAgreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_clientAgreementLineId_fkey" FOREIGN KEY ("clientAgreementLineId") REFERENCES "ClientAgreementLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

