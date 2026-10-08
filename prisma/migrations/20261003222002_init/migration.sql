-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'ASESOR', 'LECTURA');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('VIGENTE', 'PAGADO', 'REESTRUCTURADO', 'CASTIGADO');

-- CreateEnum
CREATE TYPE "InstallmentStatus" AS ENUM ('PENDIENTE', 'PARCIAL', 'PAGADA', 'VENCIDA', 'ANULADA');

-- CreateEnum
CREATE TYPE "AllocationType" AS ENUM ('MORA', 'INTERES', 'CAPITAL', 'ABONO_EXTRA');

-- CreateEnum
CREATE TYPE "LoanEventType" AS ENUM ('DESEMBOLSO', 'ABONO_EXTRA', 'REESTRUCTURA', 'CASTIGO', 'ANULACION', 'AJUSTE');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('INGRESO', 'EGRESO');

-- CreateEnum
CREATE TYPE "LedgerCategory" AS ENUM ('CAPITAL', 'INTERES', 'MORA', 'OTROS');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'LECTURA',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "occupation" TEXT,
    "birthDate" DATE,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_profiles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rate" DECIMAL(12,8) NOT NULL,
    "frequency" TEXT NOT NULL,
    "interestType" TEXT NOT NULL,
    "amortizationMethod" TEXT NOT NULL,
    "moraDailyRatePercent" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "moraGraceDays" INTEGER NOT NULL DEFAULT 0,
    "moraCapPercentOfBalance" DECIMAL(8,4),
    "moraOnTotalBalance" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loans" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "rateProfileId" TEXT,
    "status" "LoanStatus" NOT NULL DEFAULT 'VIGENTE',
    "rateSnapshot" DECIMAL(12,8) NOT NULL,
    "frequencySnapshot" TEXT NOT NULL,
    "interestTypeSnapshot" TEXT NOT NULL,
    "methodSnapshot" TEXT NOT NULL,
    "moraDailyRateSnapshot" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "moraGraceDaysSnapshot" INTEGER NOT NULL DEFAULT 0,
    "moraCapPercentSnapshot" DECIMAL(8,4),
    "moraOnTotalSnapshot" BOOLEAN NOT NULL DEFAULT false,
    "principal" DECIMAL(18,4) NOT NULL,
    "termPeriods" INTEGER NOT NULL,
    "disbursementDate" DATE NOT NULL,
    "firstDueDate" DATE,
    "notes" TEXT,
    "paidOffAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_installments" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "period" INTEGER NOT NULL,
    "dueDate" DATE NOT NULL,
    "openingBalance" DECIMAL(18,4) NOT NULL,
    "scheduledPayment" DECIMAL(18,4) NOT NULL,
    "interest" DECIMAL(18,4) NOT NULL,
    "principal" DECIMAL(18,4) NOT NULL,
    "extraPrincipal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "accruedMora" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "closingBalance" DECIMAL(18,4) NOT NULL,
    "paidInterest" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "paidPrincipal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "paidMora" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "status" "InstallmentStatus" NOT NULL DEFAULT 'PENDIENTE',

    CONSTRAINT "loan_installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "receiptNo" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "paidAt" DATE NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "installmentId" TEXT,
    "period" INTEGER NOT NULL,
    "type" "AllocationType" NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_events" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "type" "LoanEventType" NOT NULL,
    "amount" DECIMAL(18,4),
    "notes" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "paymentId" TEXT,
    "category" "LedgerCategory" NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "entryDate" DATE NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "clients_documentId_key" ON "clients"("documentId");

-- CreateIndex
CREATE INDEX "clients_lastName_firstName_idx" ON "clients"("lastName", "firstName");

-- CreateIndex
CREATE UNIQUE INDEX "rate_profiles_name_key" ON "rate_profiles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "loans_code_key" ON "loans"("code");

-- CreateIndex
CREATE INDEX "loans_status_idx" ON "loans"("status");

-- CreateIndex
CREATE INDEX "loans_clientId_idx" ON "loans"("clientId");

-- CreateIndex
CREATE INDEX "loans_disbursementDate_idx" ON "loans"("disbursementDate");

-- CreateIndex
CREATE INDEX "loan_installments_loanId_status_idx" ON "loan_installments"("loanId", "status");

-- CreateIndex
CREATE INDEX "loan_installments_dueDate_idx" ON "loan_installments"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "loan_installments_loanId_period_key" ON "loan_installments"("loanId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "payments_receiptNo_key" ON "payments"("receiptNo");

-- CreateIndex
CREATE INDEX "payments_loanId_paidAt_idx" ON "payments"("loanId", "paidAt");

-- CreateIndex
CREATE INDEX "payment_allocations_paymentId_idx" ON "payment_allocations"("paymentId");

-- CreateIndex
CREATE INDEX "payment_allocations_installmentId_idx" ON "payment_allocations"("installmentId");

-- CreateIndex
CREATE INDEX "loan_events_loanId_createdAt_idx" ON "loan_events"("loanId", "createdAt");

-- CreateIndex
CREATE INDEX "ledger_entries_loanId_category_idx" ON "ledger_entries"("loanId", "category");

-- CreateIndex
CREATE INDEX "ledger_entries_entryDate_idx" ON "ledger_entries"("entryDate");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_rateProfileId_fkey" FOREIGN KEY ("rateProfileId") REFERENCES "rate_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_installments" ADD CONSTRAINT "loan_installments_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "loan_installments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_events" ADD CONSTRAINT "loan_events_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
