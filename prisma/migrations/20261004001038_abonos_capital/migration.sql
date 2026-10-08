-- AlterTable
ALTER TABLE "loans" ADD COLUMN     "extraStrategySnapshot" TEXT NOT NULL DEFAULT 'REDUCIR_CUOTA';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'CUOTA';

-- AlterTable
ALTER TABLE "rate_profiles" ADD COLUMN     "extraPaymentStrategy" TEXT NOT NULL DEFAULT 'REDUCIR_CUOTA';
