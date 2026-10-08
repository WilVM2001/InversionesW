import { describe, expect, it } from "vitest";
import { generateSchedule } from "@/domain/amortization";
import { rescheduleWithPrepayment } from "@/domain/prepayment";
import { DEFAULT_MORA_RULE, type LoanTerms } from "@/domain/types";

describe("rescheduleWithPrepayment (Abonos extraordinarios a capital)", () => {
  const baseFrenchTerms: LoanTerms = {
    principal: 5_000_000,
    rate: 0.02,
    frequency: "MENSUAL",
    interestType: "COMPUESTA",
    amortizationMethod: "OUTSTANDING_BALANCE",
    termPeriods: 12,
    disbursementDate: "2026-01-01",
    mora: DEFAULT_MORA_RULE,
  };

  it("estrategia REDUCIR_CUOTA: reduce el valor de la cuota manteniendo el plazo", () => {
    const fullSchedule = generateSchedule(baseFrenchTerms);
    // Supongamos que ya se pagaron las primeras 2 cuotas, quedan abiertas de la 3 a la 12 (10 cuotas)
    const openRows = fullSchedule.slice(2);
    const initialPayment = openRows[0].scheduledPayment; // ~472,797.98

    // Hacemos un abono a capital de 1.000.000
    const res = rescheduleWithPrepayment({
      openRows,
      extraAmount: 1_000_000,
      rate: baseFrenchTerms.rate,
      method: "OUTSTANDING_BALANCE",
      strategy: "REDUCIR_CUOTA",
      previousPayment: initialPayment,
    });

    expect(res.newTerm).toBe(openRows.length);
    expect(res.cancelledRows).toHaveLength(0);
    expect(res.newPayment).toBeLessThan(initialPayment);
    // La suma del capital de las nuevas cuotas debe ser igual al nuevo saldo
    const totalPrincipal = res.updatedRows.reduce((sum, r) => sum + r.principal, 0);
    expect(totalPrincipal).toBeCloseTo(res.remainingCapital, 2);
    // La última cuota cierra con saldo en 0
    expect(res.updatedRows[res.updatedRows.length - 1].closingBalance).toBe(0);
  });

  it("estrategia REDUCIR_PLAZO: mantiene la cuota aproximada y reduce el número de períodos", () => {
    const fullSchedule = generateSchedule(baseFrenchTerms);
    const openRows = fullSchedule.slice(2); // 10 cuotas abiertas
    const initialPayment = openRows[0].scheduledPayment;

    // Hacemos un abono a capital significativo: 1.500.000
    const res = rescheduleWithPrepayment({
      openRows,
      extraAmount: 1_500_000,
      rate: baseFrenchTerms.rate,
      method: "OUTSTANDING_BALANCE",
      strategy: "REDUCIR_PLAZO",
      previousPayment: initialPayment,
    });

    expect(res.newTerm).toBeLessThan(openRows.length);
    expect(res.cancelledRows.length).toBeGreaterThan(0);
    expect(res.newTerm + res.cancelledRows.length).toBe(openRows.length);

    // Amortiza el saldo pendiente restante exactamente
    const totalPrincipal = res.updatedRows.reduce((sum, r) => sum + r.principal, 0);
    expect(totalPrincipal).toBeCloseTo(res.remainingCapital, 2);

    // La última cuota cierra con saldo en 0
    expect(res.updatedRows[res.updatedRows.length - 1].closingBalance).toBe(0);
  });

  it("soporta REDUCIR_CUOTA y REDUCIR_PLAZO sobre ORIGINAL_CAPITAL", () => {
    const flatTerms: LoanTerms = {
      principal: 3_000_000,
      rate: 0.05,
      frequency: "MENSUAL",
      interestType: "SIMPLE",
      amortizationMethod: "ORIGINAL_CAPITAL",
      termPeriods: 6,
      disbursementDate: "2026-01-01",
      mora: DEFAULT_MORA_RULE,
    };

    const fullSchedule = generateSchedule(flatTerms);
    const openRows = fullSchedule.slice(1); // 5 cuotas abiertas
    const prevPayment = openRows[0].scheduledPayment;

    // Abono a capital de 500.000 reduciendo cuota
    const resCuota = rescheduleWithPrepayment({
      openRows,
      extraAmount: 500_000,
      rate: flatTerms.rate,
      method: "ORIGINAL_CAPITAL",
      strategy: "REDUCIR_CUOTA",
      previousPayment: prevPayment,
    });
    expect(resCuota.newTerm).toBe(5);
    expect(resCuota.newPayment).toBeLessThan(prevPayment);

    // Abono a capital reduciendo plazo
    const resPlazo = rescheduleWithPrepayment({
      openRows,
      extraAmount: 1_000_000,
      rate: flatTerms.rate,
      method: "ORIGINAL_CAPITAL",
      strategy: "REDUCIR_PLAZO",
      previousPayment: prevPayment,
    });
    expect(resPlazo.newTerm).toBeLessThan(5);
    expect(resPlazo.cancelledRows.length).toBeGreaterThan(0);
  });

  it("cancela todas las cuotas cuando el abono cubre el total de la deuda pendiente", () => {
    const fullSchedule = generateSchedule(baseFrenchTerms);
    const openRows = fullSchedule.slice(6); // 6 cuotas restantes
    const remainingPrincipal = openRows.reduce((sum, r) => sum + r.principal, 0);

    const res = rescheduleWithPrepayment({
      openRows,
      extraAmount: remainingPrincipal + 50_000, // Cubre con holgura
      rate: baseFrenchTerms.rate,
      method: "OUTSTANDING_BALANCE",
      strategy: "REDUCIR_CUOTA",
    });

    expect(res.updatedRows).toHaveLength(0);
    expect(res.cancelledRows).toHaveLength(openRows.length);
    expect(res.remainingCapital).toBe(0);
    expect(res.cancelledRows.every((r) => r.closingBalance === 0 && r.scheduledPayment === 0)).toBe(true);
  });

  it("arroja error si openRows está vacío o extraAmount <= 0", () => {
    expect(() =>
      rescheduleWithPrepayment({
        openRows: [],
        extraAmount: 100_000,
        rate: 0.02,
        method: "OUTSTANDING_BALANCE",
        strategy: "REDUCIR_CUOTA",
      }),
    ).toThrow("No hay cuotas abiertas");

    const fullSchedule = generateSchedule(baseFrenchTerms);
    expect(() =>
      rescheduleWithPrepayment({
        openRows: fullSchedule,
        extraAmount: 0,
        rate: 0.02,
        method: "OUTSTANDING_BALANCE",
        strategy: "REDUCIR_CUOTA",
      }),
    ).toThrow("debe ser mayor que cero");
  });
});
