import { describe, expect, it } from "vitest";
import { getMonthRange, computeMonthlyControl } from "@/domain/portfolio";

describe("getMonthRange", () => {
  it("genera el rango correcto para un mes específico", () => {
    const r = getMonthRange("2026-10");
    expect(r.year).toBe(2026);
    expect(r.month).toBe(10);
    expect(r.monthStr).toBe("2026-10");
    expect(r.label).toBe("Octubre 2026");
    expect(r.startDate.toISOString()).toContain("2026-10-01");
    expect(r.endDate.toISOString()).toContain("2026-11-01");
  });

  it("maneja el paso de año en diciembre", () => {
    const r = getMonthRange("2026-12");
    expect(r.startDate.toISOString()).toContain("2026-12-01");
    expect(r.endDate.toISOString()).toContain("2027-01-01");
  });

  it("toma el mes actual si no se pasa parámetro", () => {
    const r = getMonthRange();
    const now = new Date();
    expect(r.year).toBe(now.getFullYear());
    expect(r.month).toBe(now.getMonth() + 1);
  });
});

describe("computeMonthlyControl", () => {
  it("calcula meta, recaudado, utilidad y brecha correctamente", () => {
    const m = computeMonthlyControl({
      targetPrincipal: 4_000_000,
      targetInterest: 1_000_000,
      collectedPrincipal: 3_500_000,
      collectedInterest: 900_000,
      collectedMora: 100_000,
    });

    expect(m.targetScheduled).toBe(5_000_000);
    expect(m.collectedPrincipal).toBe(3_500_000);
    expect(m.collectedProfit).toBe(1_000_000);
    expect(m.collectedThisMonth).toBe(4_500_000);
    expect(m.difference).toBe(-500_000);
    expect(m.compliancePct).toBe(90);
    expect(m.isAhead).toBe(false);
  });

  it("marca isAhead=true cuando se supera la meta programada", () => {
    const m = computeMonthlyControl({
      targetPrincipal: 2_000_000,
      targetInterest: 500_000,
      collectedPrincipal: 3_000_000, // Hubo abono extraordinario
      collectedInterest: 500_000,
      collectedMora: 0,
    });

    expect(m.targetScheduled).toBe(2_500_000);
    expect(m.collectedThisMonth).toBe(3_500_000);
    expect(m.difference).toBe(1_000_000);
    expect(m.compliancePct).toBe(140);
    expect(m.isAhead).toBe(true);
  });
});
