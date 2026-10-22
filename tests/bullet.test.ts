import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  generateInterestOnlySchedule,
  generateSchedule,
  renewBulletSchedule,
  scheduleTotals,
} from "@/domain/amortization";
import { rescheduleWithPrepayment } from "@/domain/prepayment";
import { applyPayment, buildSnapshots, portfolioSummary } from "@/domain/payments";
import { addMonths } from "date-fns";
import type { LoanTerms, MoraRule } from "@/domain/types";

describe("Motor Financiero - Amortización BULLET (Americano)", () => {
  const defaultMora: MoraRule = {
    dailyRatePercent: 0,
    graceDays: 0,
    capPercentOfBalance: null,
    onTotalBalance: false,
  };

  const bullet12mTerms: LoanTerms = {
    principal: 20_000_000,
    rate: 0.02, // 2% mensual
    frequency: "MENSUAL",
    interestType: "SIMPLE",
    amortizationMethod: "BULLET",
    termPeriods: 12,
    disbursementDate: "2026-01-01",
    mora: defaultMora,
  };

  it("genera el cronograma Bullet de 12 meses: cuotas 1-11 solo interés, cuota 12 capital + interés", () => {
    const rows = generateSchedule(bullet12mTerms);

    expect(rows).toHaveLength(12);

    // Cuotas 1 a 11
    for (let i = 0; i < 11; i += 1) {
      const r = rows[i];
      expect(r.period).toBe(i + 1);
      expect(r.openingBalance).toBe(20_000_000);
      expect(r.interest).toBe(400_000); // 20.000.000 * 2% = 400.000
      expect(r.principal).toBe(0); // Cero amortización de capital
      expect(r.scheduledPayment).toBe(400_000);
      expect(r.closingBalance).toBe(20_000_000);
      expect(r.totalDue).toBe(400_000);
    }

    // Cuota 12 (Vencimiento del capital)
    const last = rows[11];
    expect(last.period).toBe(12);
    expect(last.openingBalance).toBe(20_000_000);
    expect(last.interest).toBe(400_000);
    expect(last.principal).toBe(20_000_000); // Capital total
    expect(last.scheduledPayment).toBe(20_400_000); // 20M capital + 400k interés
    expect(last.closingBalance).toBe(0); // Cierra en cero
    expect(last.totalDue).toBe(20_400_000);

    // Totales del préstamo
    const totals = scheduleTotals(rows);
    expect(totals.totalPrincipal).toBe(20_000_000);
    expect(totals.totalInterest).toBe(4_800_000); // 12 * 400.000
    expect(totals.totalScheduled).toBe(24_800_000);
  });

  it("soporta préstamos Bullet de plazo = 1 (pago único capital + interés)", () => {
    const singleTerm: LoanTerms = {
      ...bullet12mTerms,
      termPeriods: 1,
    };
    const rows = generateSchedule(singleTerm);

    expect(rows).toHaveLength(1);
    expect(rows[0].period).toBe(1);
    expect(rows[0].openingBalance).toBe(20_000_000);
    expect(rows[0].interest).toBe(400_000);
    expect(rows[0].principal).toBe(20_000_000);
    expect(rows[0].scheduledPayment).toBe(20_400_000);
    expect(rows[0].closingBalance).toBe(0);
  });

  it("recalcula interés y cuota final ante abono extraordinario a capital (mes 4 abono 5.000.000)", () => {
    const rows = generateSchedule(bullet12mTerms);

    // Supongamos que cuotas 1 a 4 ya pasaron; quedan abiertas cuotas 5 a 12 (8 cuotas)
    const openRows = rows.slice(4);
    expect(openRows).toHaveLength(8);

    // Abono extraordinario de 5.000.000 COP
    const reschedule = rescheduleWithPrepayment({
      openRows,
      extraAmount: 5_000_000,
      rate: bullet12mTerms.rate,
      method: "BULLET",
      strategy: "REDUCIR_CUOTA",
    });

    expect(reschedule.capitalReduced).toBe(5_000_000);
    expect(reschedule.remainingCapital).toBe(15_000_000);
    expect(reschedule.updatedRows).toHaveLength(8);

    // Cuotas 5 a 11 (períodos 5 a 11): nuevo interés 15.000.000 * 2% = 300.000 COP
    for (let i = 0; i < 7; i += 1) {
      const r = reschedule.updatedRows[i];
      expect(r.period).toBe(5 + i);
      expect(r.openingBalance).toBe(15_000_000);
      expect(r.interest).toBe(300_000);
      expect(r.principal).toBe(0);
      expect(r.scheduledPayment).toBe(300_000);
      expect(r.closingBalance).toBe(15_000_000);
    }

    // Cuota 12 (vencimiento): capital 15.000.000 + interés 300.000 = 15.300.000 COP
    const finalRow = reschedule.updatedRows[7];
    expect(finalRow.period).toBe(12);
    expect(finalRow.openingBalance).toBe(15_000_000);
    expect(finalRow.interest).toBe(300_000);
    expect(finalRow.principal).toBe(15_000_000);
    expect(finalRow.scheduledPayment).toBe(15_300_000);
    expect(finalRow.closingBalance).toBe(0);
  });

  it("clasifica contablemente 100% como interés en cuotas 1-11 y separa capital e interés en cuota 12", () => {
    const rows = generateSchedule(bullet12mTerms);
    const paidByPeriod = new Map<number, { mora: number; interest: number; principal: number }>();

    // Simular cobro de la cuota 1: pago ordinario de 400.000 COP
    const snapshots1 = buildSnapshots(rows, paidByPeriod, defaultMora, new Date("2026-02-01"));
    const payment1 = applyPayment(snapshots1, 400_000);

    expect(payment1.unapplied).toBe(0);
    expect(payment1.allocations).toHaveLength(1);
    expect(payment1.allocations[0].type).toBe("INTERES");
    expect(payment1.allocations[0].amount).toBe(400_000);
    expect(payment1.allocations[0].period).toBe(1);

    // Simular que se llega a la cuota 12 y se pagan los 20.400.000 COP
    paidByPeriod.set(1, { mora: 0, interest: 400_000, principal: 0 });
    // Marcar cuotas 2 a 11 pagadas
    for (let p = 2; p <= 11; p += 1) {
      paidByPeriod.set(p, { mora: 0, interest: 400_000, principal: 0 });
    }

    const snapshots12 = buildSnapshots(rows, paidByPeriod, defaultMora, new Date("2027-01-01"));
    const payment12 = applyPayment(snapshots12, 20_400_000);

    expect(payment12.unapplied).toBe(0);
    expect(payment12.allocations).toHaveLength(2);

    // Primero cubre interés (400.000 COP)
    const intAlloc = payment12.allocations.find((a) => a.type === "INTERES");
    expect(intAlloc).toBeDefined();
    expect(intAlloc?.amount).toBe(400_000);

    // Luego cubre capital (20.000.000 COP)
    const capAlloc = payment12.allocations.find((a) => a.type === "CAPITAL");
    expect(capAlloc).toBeDefined();
    expect(capAlloc?.amount).toBe(20_000_000);
  });

  it("permite prórroga/renovación Bullet por 6 meses: cuota 12 pasa a interés puro y añade cuotas 13-18", () => {
    const rows = generateSchedule(bullet12mTerms);
    const lastRow = rows[11]; // Período 12

    const renewal = renewBulletSchedule({
      lastMaturityRow: lastRow,
      newTermMonths: 6,
      rate: bullet12mTerms.rate,
      frequency: "MENSUAL",
    });

    // La cuota 12 ahora es solo interés
    expect(renewal.updatedLastRow.period).toBe(12);
    expect(renewal.updatedLastRow.principal).toBe(0);
    expect(renewal.updatedLastRow.interest).toBe(400_000);
    expect(renewal.updatedLastRow.scheduledPayment).toBe(400_000);
    expect(renewal.updatedLastRow.closingBalance).toBe(20_000_000);

    // Nuevas cuotas 13 a 18
    expect(renewal.newRows).toHaveLength(6);

    // Cuotas 13 a 17 (solo interés)
    for (let i = 0; i < 5; i += 1) {
      const r = renewal.newRows[i];
      expect(r.period).toBe(13 + i);
      expect(r.openingBalance).toBe(20_000_000);
      expect(r.interest).toBe(400_000);
      expect(r.principal).toBe(0);
      expect(r.scheduledPayment).toBe(400_000);
      expect(r.closingBalance).toBe(20_000_000);
    }

    // Cuota 18 (nuevo vencimiento de capital)
    const newFinalRow = renewal.newRows[5];
    expect(newFinalRow.period).toBe(18);
    expect(newFinalRow.openingBalance).toBe(20_000_000);
    expect(newFinalRow.interest).toBe(400_000);
    expect(newFinalRow.principal).toBe(20_000_000);
    expect(newFinalRow.scheduledPayment).toBe(20_400_000);
    expect(newFinalRow.closingBalance).toBe(0);
  });

  it("calcula la prórroga sobre capital remanente reducido por abonos previos", () => {
    const rows = generateSchedule(bullet12mTerms);
    const lastRow = rows[11];

    // Supongamos que hubo abonos previos y el saldo remanente es 15.000.000 COP
    const renewal = renewBulletSchedule({
      lastMaturityRow: lastRow,
      newTermMonths: 3,
      rate: bullet12mTerms.rate,
      frequency: "MENSUAL",
      capitalRemaining: 15_000_000,
    });

    expect(renewal.updatedLastRow.principal).toBe(0);
    expect(renewal.updatedLastRow.interest).toBe(300_000); // 15M * 2% = 300k
    expect(renewal.updatedLastRow.scheduledPayment).toBe(300_000);
    expect(renewal.updatedLastRow.closingBalance).toBe(15_000_000);

    expect(renewal.newRows).toHaveLength(3);
    expect(renewal.newRows[0].scheduledPayment).toBe(300_000);
    expect(renewal.newRows[1].scheduledPayment).toBe(300_000);
    expect(renewal.newRows[2].principal).toBe(15_000_000);
    expect(renewal.newRows[2].scheduledPayment).toBe(15_300_000);
    expect(renewal.newRows[2].closingBalance).toBe(0);
  });

  it("generateInterestOnlySchedule con Decimal.js genera cuotas 100% interés y capital al final", () => {
    const installments = generateInterestOnlySchedule({
      principal: new Decimal(10_000_000),
      ratePerPeriod: new Decimal(0.02),
      numberOfInstallments: 6,
      firstDueDate: new Date("2026-02-01"),
      addPeriodFn: (date, index) => addMonths(date, index),
    });

    expect(installments).toHaveLength(6);

    // Cuotas 1 a 5: aporte a capital 0, 100% cuota interés, saldo intacto
    for (let i = 0; i < 5; i += 1) {
      const inst = installments[i];
      expect(inst.installmentNumber).toBe(i + 1);
      expect(inst.interestAmount.toNumber()).toBe(200_000);
      expect(inst.principalAmount.toNumber()).toBe(0);
      expect(inst.totalDue.toNumber()).toBe(200_000);
      expect(inst.remainingPrincipal.toNumber()).toBe(10_000_000);
    }

    // Cuota 6 (Vencimiento final)
    const finalInst = installments[5];
    expect(finalInst.installmentNumber).toBe(6);
    expect(finalInst.interestAmount.toNumber()).toBe(200_000);
    expect(finalInst.principalAmount.toNumber()).toBe(10_000_000);
    expect(finalInst.totalDue.toNumber()).toBe(10_200_000);
    expect(finalInst.remainingPrincipal.toNumber()).toBe(0);
  });

  it("calcula mora devengada sobre el interés impago cuando la cuota es de solo interés", () => {
    const moraRule: MoraRule = {
      dailyRatePercent: 1, // 1% diario
      graceDays: 0,
      capPercentOfBalance: null,
      onTotalBalance: false,
    };

    const termsWithMora: LoanTerms = {
      ...bullet12mTerms,
      mora: moraRule,
    };

    const rows = generateSchedule(termsWithMora);
    // Cuota 1 vence 2026-02-01. Fecha de corte: 2026-02-11 (10 días de atraso)
    const paidByPeriod = new Map<number, { mora: number; interest: number; principal: number }>();
    const asOf = new Date("2026-02-11T12:00:00");

    const snapshots = buildSnapshots(rows, paidByPeriod, moraRule, asOf);
    const snap1 = snapshots[0];

    // En cuota 1, principal es 0 pero interés es 400.000 COP
    expect(snap1.row.principal).toBe(0);
    expect(snap1.row.interest).toBe(400_000);

    // Mora: 400.000 * 1% * 10 días = 40.000 COP
    expect(snap1.currentMora).toBe(40_000);
    expect(snap1.status).toBe("VENCIDA");
    expect(snap1.outstanding).toBe(440_000); // 400.000 interés + 40.000 mora
  });

  it("el método INTEREST_ONLY opera de forma equivalente a BULLET", () => {
    const interestOnlyTerms: LoanTerms = {
      ...bullet12mTerms,
      amortizationMethod: "INTEREST_ONLY",
    };

    const rows = generateSchedule(interestOnlyTerms);
    expect(rows).toHaveLength(12);
    expect(rows[0].interest).toBe(400_000);
    expect(rows[0].principal).toBe(0);
    expect(rows[0].scheduledPayment).toBe(400_000);
    expect(rows[11].principal).toBe(20_000_000);
    expect(rows[11].scheduledPayment).toBe(20_400_000);

    // Saldo insoluto en portfolio permanece intacto
    const paidByPeriod = new Map<number, { mora: number; interest: number; principal: number }>();
    paidByPeriod.set(1, { mora: 0, interest: 400_000, principal: 0 }); // pagada cuota 1
    const snapshots = buildSnapshots(rows, paidByPeriod, defaultMora, new Date("2026-02-15"));
    const summary = portfolioSummary(snapshots);

    expect(summary.principalOutstanding).toBe(20_000_000); // Intacto
  });
});

