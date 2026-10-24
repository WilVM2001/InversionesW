import { describe, expect, it } from "vitest";
import { generateSchedule, scheduleTotals } from "@/domain/amortization";
import { buildSnapshots, planPayment } from "@/domain/payments";
import type { LoanTerms, MoraRule, ScheduleRow } from "@/domain/types";

describe("Edición de Préstamos - Regeneración de Cronogramas y Re-imputación", () => {
  const defaultMora: MoraRule = {
    dailyRatePercent: 0,
    graceDays: 0,
    capPercentOfBalance: null,
    onTotalBalance: false,
  };

  it("permite recalcular un crédito cambiando de cuota francesa/capital a modalidad Bullet", () => {
    // Original: Cuota fija sobre saldo o capital original
    const originalTerms: LoanTerms = {
      principal: 10_000_000,
      rate: 0.02,
      frequency: "MENSUAL",
      interestType: "SIMPLE",
      amortizationMethod: "ORIGINAL_CAPITAL",
      termPeriods: 10,
      disbursementDate: "2026-01-01",
      mora: defaultMora,
    };
    const originalRows = generateSchedule(originalTerms);
    expect(originalRows[0].principal).toBe(1_000_000);
    expect(originalRows[0].scheduledPayment).toBe(1_020_000);

    // Editado a BULLET: Solo interés en intermedias, capital al final
    const editedTerms: LoanTerms = {
      ...originalTerms,
      amortizationMethod: "BULLET",
      termPeriods: 6,
    };
    const newRows = generateSchedule(editedTerms);
    expect(newRows).toHaveLength(6);
    expect(newRows[0].principal).toBe(0);
    expect(newRows[0].interest).toBe(200_000);
    expect(newRows[0].scheduledPayment).toBe(200_000);
    expect(newRows[5].principal).toBe(10_000_000);
    expect(newRows[5].scheduledPayment).toBe(10_200_000);
  });

  it("re-aplica pagos existentes contra las nuevas cuotas calculadas", () => {
    const editedTerms: LoanTerms = {
      principal: 5_000_000,
      rate: 0.02,
      frequency: "MENSUAL",
      interestType: "SIMPLE",
      amortizationMethod: "BULLET",
      termPeriods: 6,
      disbursementDate: "2026-01-01",
      mora: defaultMora,
    };
    const newRows: ScheduleRow[] = generateSchedule(editedTerms);

    // Simular un pago previo de 100.000 COP registrado en cuota 1
    const paidByPeriod = new Map<number, { mora: number; interest: number; principal: number }>();
    const snapshots = buildSnapshots(newRows, paidByPeriod, defaultMora, new Date("2026-02-01"));

    const plan = planPayment({
      snapshots,
      amount: 100_000,
      kind: "CUOTA",
      asOf: new Date("2026-02-01"),
    });

    expect(plan.allocations).toHaveLength(1);
    expect(plan.allocations[0].period).toBe(1);
    expect(plan.allocations[0].type).toBe("INTERES");
    expect(plan.allocations[0].amount).toBe(100_000);
  });

  it("recalcula correctamente totales al modificar el capital prestado", () => {
    const termsOriginal: LoanTerms = {
      principal: 2_000_000,
      rate: 0.05,
      frequency: "MENSUAL",
      interestType: "SIMPLE",
      amortizationMethod: "BULLET",
      termPeriods: 3,
      disbursementDate: "2026-01-01",
      mora: defaultMora,
    };
    const rows1 = generateSchedule(termsOriginal);
    const totals1 = scheduleTotals(rows1);
    expect(totals1.totalInterest).toBe(300_000); // 2.000.000 * 5% * 3 = 300.000

    // Modificado a 4.000.000
    const termsModified: LoanTerms = {
      ...termsOriginal,
      principal: 4_000_000,
    };
    const rows2 = generateSchedule(termsModified);
    const totals2 = scheduleTotals(rows2);
    expect(totals2.totalInterest).toBe(600_000); // 4.000.000 * 5% * 3 = 600.000
    expect(totals2.totalScheduled).toBe(4_600_000);
  });
});
