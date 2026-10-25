import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  generateSchedule,
  scheduleTotals,
  renewBulletSchedule,
} from "@/domain/amortization";
import {
  applyPayment,
  buildSnapshots,
  planPayment,
  portfolioSummary,
} from "@/domain/payments";
import { addPeriods, daysBetween, toDate, toIso } from "@/domain/dates";
import {
  parseIntegerInput,
  parseMoneyInput,
  parsePercentInput,
} from "@/domain/parse";
import type { LoanTerms, MoraRule, ScheduleRow } from "@/domain/types";

describe("Pruebas de Estrés y Casos Extremos (Stress Testing)", () => {
  const zeroMora: MoraRule = {
    dailyRatePercent: 0,
    graceDays: 0,
    capPercentOfBalance: null,
    onTotalBalance: false,
  };

  const activeMora: MoraRule = {
    dailyRatePercent: 1, // 1% diario
    graceDays: 2,
    capPercentOfBalance: 50,
    onTotalBalance: false,
  };

  describe("1. Parser de Dinero y Porcentajes en Casos Límite", () => {
    it("parsea formatos con puntos, comas, símbolos y espacios", () => {
      expect(parseMoneyInput("$ 1.000.000")?.toNumber()).toBe(1_000_000);
      expect(parseMoneyInput("1.000.000,50")?.toNumber()).toBe(1_000_000.5);
      expect(parseMoneyInput("5000000")?.toNumber()).toBe(5_000_000);
      expect(parseMoneyInput("5.000")?.toNumber()).toBe(5_000);
      expect(parseMoneyInput("50.000")?.toNumber()).toBe(50_000);
      expect(parseMoneyInput("500.000")?.toNumber()).toBe(500_000);
      expect(parseMoneyInput("5000,25")?.toNumber()).toBe(5000.25);
    });

    it("maneja entradas vacías, nulas o con caracteres inválidos sin crashear", () => {
      expect(parseMoneyInput("")).toBeNull();
      expect(parseMoneyInput("   ")).toBeNull();
      expect(parseMoneyInput(null)).toBeNull();
      expect(parseMoneyInput(undefined)).toBeNull();
      expect(parseMoneyInput("texto sin numeros")).toBeNull();
      expect(parseMoneyInput("---")).toBeNull();
    });

    it("parsea tasas porcentuales con punto o coma indiferentemente", () => {
      expect(parsePercentInput("2")?.toNumber()).toBe(2);
      expect(parsePercentInput("2.5")?.toNumber()).toBe(2.5);
      expect(parsePercentInput("2,5")?.toNumber()).toBe(2.5);
      expect(parsePercentInput("0.25")?.toNumber()).toBe(0.25);
      expect(parsePercentInput("% 15.75")?.toNumber()).toBe(15.75);
    });

    it("valida enteros estrictos para plazos y días de gracia", () => {
      expect(parseIntegerInput("12")).toBe(12);
      expect(parseIntegerInput("12.5")).toBeNull();
      expect(parseIntegerInput("0")).toBe(0);
      expect(parseIntegerInput("-5")).toBe(-5);
    });
  });

  describe("2. Fechas, Calendario y Bisiestos", () => {
    it("suma períodos mensuales correctamente pasando por fin de mes y febrero", () => {
      // 31 de Enero + 1 mes mensual
      const d1 = toDate("2026-01-31");
      const d2 = addPeriods(d1, "MENSUAL", 1);
      expect(toIso(d2)).toBe("2026-02-28"); // Año no bisiesto 2026

      // En año bisiesto 2028:
      const leapJan = toDate("2028-01-31");
      const leapFeb = addPeriods(leapJan, "MENSUAL", 1);
      expect(toIso(leapFeb)).toBe("2028-02-29");
    });

    it("calcula diferencia de días calendario exacta", () => {
      const start = toDate("2026-10-01");
      const end = toDate("2026-10-25");
      expect(daysBetween(start, end)).toBe(24);
      expect(daysBetween(end, start)).toBe(-24);
      expect(daysBetween(start, start)).toBe(0);
    });
  });

  describe("3. Motor Financiero con Parámetros Extremos", () => {
    it("soporta tasa de interés cero (0%) en Tasa Fija, Saldo Insoluto y Bullet sin división por cero", () => {
      const termsZeroRateOriginal: LoanTerms = {
        principal: 1_200_000,
        rate: 0,
        frequency: "MENSUAL",
        interestType: "SIMPLE",
        amortizationMethod: "ORIGINAL_CAPITAL",
        termPeriods: 12,
        disbursementDate: "2026-01-01",
        mora: zeroMora,
      };
      const rows1 = generateSchedule(termsZeroRateOriginal);
      const totals1 = scheduleTotals(rows1);
      expect(totals1.totalInterest).toBe(0);
      expect(totals1.totalScheduled).toBe(1_200_000);
      expect(rows1[0].scheduledPayment).toBe(100_000);

      const termsZeroRateFrench: LoanTerms = {
        ...termsZeroRateOriginal,
        amortizationMethod: "OUTSTANDING_BALANCE",
        interestType: "COMPUESTA",
      };
      const rows2 = generateSchedule(termsZeroRateFrench);
      const totals2 = scheduleTotals(rows2);
      expect(totals2.totalInterest).toBe(0);
      expect(totals2.totalScheduled).toBe(1_200_000);
      expect(rows2[0].scheduledPayment).toBe(100_000);

      const termsZeroRateBullet: LoanTerms = {
        ...termsZeroRateOriginal,
        amortizationMethod: "BULLET",
      };
      const rows3 = generateSchedule(termsZeroRateBullet);
      const totals3 = scheduleTotals(rows3);
      expect(totals3.totalInterest).toBe(0);
      expect(rows3[0].scheduledPayment).toBe(0);
      expect(rows3[11].scheduledPayment).toBe(1_200_000);
    });

    it("soporta crédito de 1 sola cuota (plazo mínimo)", () => {
      const terms1Period: LoanTerms = {
        principal: 500_000,
        rate: 0.1, // 10%
        frequency: "MENSUAL",
        interestType: "SIMPLE",
        amortizationMethod: "ORIGINAL_CAPITAL",
        termPeriods: 1,
        disbursementDate: "2026-01-01",
        mora: zeroMora,
      };
      const rows = generateSchedule(terms1Period);
      expect(rows).toHaveLength(1);
      expect(rows[0].period).toBe(1);
      expect(rows[0].principal).toBe(500_000);
      expect(rows[0].interest).toBe(50_000);
      expect(rows[0].scheduledPayment).toBe(550_000);
      expect(rows[0].closingBalance).toBe(0);
    });

    it("soporta capitales masivos (ej. 5.000 millones COP) sin desbordamiento de coma flotante", () => {
      const termsHuge: LoanTerms = {
        principal: 5_000_000_000,
        rate: 0.02,
        frequency: "MENSUAL",
        interestType: "SIMPLE",
        amortizationMethod: "BULLET",
        termPeriods: 12,
        disbursementDate: "2026-01-01",
        mora: zeroMora,
      };
      const rows = generateSchedule(termsHuge);
      const totals = scheduleTotals(rows);
      expect(rows[0].interest).toBe(100_000_000); // 100M mensuales
      expect(rows[11].scheduledPayment).toBe(5_100_000_000);
      expect(totals.totalInterest).toBe(1_200_000_000);
      expect(totals.totalScheduled).toBe(6_200_000_000);
    });
  });

  describe("4. Imputación de Pagos, Excedentes y Casos Inusuales", () => {
    it("maneja pagos que exceden la deuda total sin perder el excedente (unapplied)", () => {
      const terms: LoanTerms = {
        principal: 1_000_000,
        rate: 0.05,
        frequency: "MENSUAL",
        interestType: "SIMPLE",
        amortizationMethod: "ORIGINAL_CAPITAL",
        termPeriods: 2,
        disbursementDate: "2026-01-01",
        mora: zeroMora,
      };
      const rows = generateSchedule(terms); // Cuota ~525.000, Total ~1.050.000
      const paidByPeriod = new Map<number, { mora: number; interest: number; principal: number }>();
      const snapshots = buildSnapshots(rows, paidByPeriod, zeroMora, new Date("2026-01-15"));

      // El cliente paga 1.500.000 COP (500.000 de más)
      const plan = planPayment({
        snapshots,
        amount: 1_500_000,
        kind: "CUOTA",
        surplusMode: "ADELANTAR_CUOTAS",
        asOf: new Date("2026-01-15"),
      });

      expect(plan.unapplied).toBe(450_000); // 1.500.000 - 1.050.000 = 450.000 no imputado
      expect(plan.totalApplied).toBe(1_050_000);
    });

    it("aplica la prelación de cobro estricta: Mora -> Interés -> Capital", () => {
      const terms: LoanTerms = {
        principal: 1_000_000,
        rate: 0.05,
        frequency: "MENSUAL",
        interestType: "SIMPLE",
        amortizationMethod: "ORIGINAL_CAPITAL",
        termPeriods: 2,
        disbursementDate: "2026-01-01",
        mora: activeMora,
      };
      const rows = generateSchedule(terms);
      const paidByPeriod = new Map<number, { mora: number; interest: number; principal: number }>();

      // Corte con mora devengada en cuota 1
      const asOf = new Date("2026-03-01");
      const snapshots = buildSnapshots(rows, paidByPeriod, activeMora, asOf);
      expect(snapshots[0].currentMora).toBeGreaterThan(0);

      const moraValue = snapshots[0].currentMora;
      // Abono pequeño que solo alcanza para parte de la mora
      const smallPayment = Math.floor(moraValue / 2);
      const applied = applyPayment(snapshots, smallPayment);

      expect(applied.allocations).toHaveLength(1);
      expect(applied.allocations[0].type).toBe("MORA");
      expect(applied.allocations[0].amount).toBe(smallPayment);
    });
  });

  describe("5. Prórrogas Bullet Consecutivas", () => {
    it("permite extender múltiples veces un crédito Bullet manteniendo la integridad del capital", () => {
      // 1. Plazo inicial: 6 meses
      const terms: LoanTerms = {
        principal: 15_000_000,
        rate: 0.02,
        frequency: "MENSUAL",
        interestType: "SIMPLE",
        amortizationMethod: "BULLET",
        termPeriods: 6,
        disbursementDate: "2026-01-01",
        mora: zeroMora,
      };
      const rowsInitial = generateSchedule(terms);
      expect(rowsInitial[5].principal).toBe(15_000_000);

      // 2. Primera prórroga (+6 meses = 12 meses totales)
      const renew1 = renewBulletSchedule({
        lastMaturityRow: rowsInitial[5],
        newTermMonths: 6,
        rate: 0.02,
        capitalRemaining: 15_000_000,
        frequency: "MENSUAL",
      });

      expect(renew1.updatedLastRow.principal).toBe(0);
      expect(renew1.newRows).toHaveLength(6);
      expect(renew1.newRows[5].period).toBe(12);
      expect(renew1.newRows[5].principal).toBe(15_000_000);
      expect(renew1.newRows[5].scheduledPayment).toBe(15_300_000);

      // 3. Segunda prórroga (+3 meses = 15 meses totales)
      const renew2 = renewBulletSchedule({
        lastMaturityRow: renew1.newRows[5],
        newTermMonths: 3,
        rate: 0.02,
        capitalRemaining: 15_000_000,
        frequency: "MENSUAL",
      });

      expect(renew2.updatedLastRow.principal).toBe(0);
      expect(renew2.newRows).toHaveLength(3);
      expect(renew2.newRows[2].period).toBe(15);
      expect(renew2.newRows[2].principal).toBe(15_000_000);
    });
  });
});
