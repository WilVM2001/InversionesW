import { describe, expect, it } from "vitest";
import { generateSchedule, scheduleTotals, computeMora, applyExtraPrincipal } from "@/domain/amortization";
import { applyPayment, buildSnapshots, outstandingBalance, portfolioSummary, previewAllocationBreakdown } from "@/domain/payments";
import { money } from "@/domain/money";
import { toDate } from "@/domain/dates";
import { DEFAULT_MORA_RULE, type LoanTerms, type MoraRule } from "@/domain/types";

const terms: LoanTerms = {
  principal: 5_000_000,
  rate: 0.02,
  frequency: "MENSUAL",
  interestType: "COMPUESTA",
  amortizationMethod: "OUTSTANDING_BALANCE",
  termPeriods: 12,
  disbursementDate: "2026-09-01",
  mora: DEFAULT_MORA_RULE,
};

const noPaid = new Map<number, { mora: number; interest: number; principal: number }>();

describe("Cálculo de mora", () => {
  it("no cobra mora antes del vencimiento", () => {
    expect(computeMora(1_000_000, { ...DEFAULT_MORA_RULE, dailyRatePercent: 1 }, 0)).toBe(0);
    expect(computeMora(1_000_000, { ...DEFAULT_MORA_RULE, dailyRatePercent: 1 }, -5)).toBe(0);
  });

  it("respeta los días de gracia", () => {
    const rule: MoraRule = { ...DEFAULT_MORA_RULE, dailyRatePercent: 1, graceDays: 3 };
    expect(computeMora(1_000_000, rule, 3)).toBe(0);
    expect(computeMora(1_000_000, rule, 4)).toBe(10000);
  });

  it("calcula 1% diario sobre el saldo", () => {
    const rule: MoraRule = { ...DEFAULT_MORA_RULE, dailyRatePercent: 1 };
    expect(computeMora(1_000_000, rule, 10)).toBe(100000);
  });

  it("respeta el tope configurado", () => {
    const rule: MoraRule = {
      ...DEFAULT_MORA_RULE,
      dailyRatePercent: 2,
      capPercentOfBalance: 10,
    };
    // 2% diario durante 30 días sería 600.000, pero el tope es 100.000.
    expect(computeMora(1_000_000, rule, 30)).toBe(100000);
  });

  it("no cobra mora si la tasa diaria es cero", () => {
    expect(computeMora(1_000_000, DEFAULT_MORA_RULE, 500)).toBe(0);
  });
});

describe("Estado de cuotas a una fecha de corte", () => {
  const rows = generateSchedule(terms);
  const rule: MoraRule = { ...DEFAULT_MORA_RULE, dailyRatePercent: 1 };

  it("marca PENDIENTE antes del vencimiento", () => {
    const snaps = buildSnapshots(rows, noPaid, rule, toDate("2026-09-15"));
    expect(snaps[0].status).toBe("PENDIENTE");
    expect(snaps[0].currentMora).toBe(0);
  });

  it("marca VENCIDA y devenga mora después del vencimiento", () => {
    // Cuota 1 vence 2026-10-01; se consulta el 2026-10-11 (10 días).
    const snaps = buildSnapshots(rows, noPaid, rule, toDate("2026-10-11"));
    expect(snaps[0].status).toBe("VENCIDA");
    expect(snaps[0].currentMora).toBeGreaterThan(0);
    expect(snaps[1].status).toBe("PENDIENTE");
  });

  it("marca PARCIAL con pago incompleto y PAGADA con pago total", () => {
    const partial = new Map([[1, { mora: 0, interest: 50000, principal: 0 }]]);
    const snaps = buildSnapshots(rows, partial, rule, toDate("2026-09-20"));
    expect(snaps[0].status).toBe("PARCIAL");

    const full = new Map([[1, { mora: 0, interest: 100000, principal: 472797.983114757 }]]);
    const snaps2 = buildSnapshots(rows, full, rule, toDate("2026-09-20"));
    expect(snaps2[0].status).toBe("PAGADA");
    expect(snaps2[0].outstanding).toBe(0);
  });

  it("el saldo pendiente es positivo, nunca negativo", () => {
    // El prototipo guarda el pendiente con signo negativo (Q = -N+M*P).
    // El sistema lo expone positivo para no inducir errores de cálculo.
    const overpaid = new Map([[1, { mora: 0, interest: 100000, principal: 999_999 }]]);
    const snaps = buildSnapshots(rows, overpaid, rule, toDate("2026-09-20"));
    expect(snaps[0].outstanding).toBe(0);
    expect(outstandingBalance(snaps)).toBeGreaterThanOrEqual(0);
  });
});

describe("Imputación de pagos", () => {
  const rows = generateSchedule(terms);
  const rule: MoraRule = { ...DEFAULT_MORA_RULE, dailyRatePercent: 1 };

  it("imputa a la cuota más antigua primero", () => {
    const applied = applyPayment(buildSnapshots(rows, noPaid, rule, toDate("2026-09-20")), 100000);
    expect(applied.allocations[0].period).toBe(1);
    expect(applied.allocations[0].type).toBe("INTERES");
    expect(applied.unapplied).toBe(0);
  });

  it("respeta el orden mora -> interés -> capital", () => {
    // Consulta 40 días después del vencimiento: hay mora que pagar.
    const snaps = buildSnapshots(rows, noPaid, rule, toDate("2026-11-10"));
    const applied = applyPayment(snaps, 50_000);
    expect(applied.allocations[0].type).toBe("MORA");
  });

  it("paga mora, luego interés y luego capital en la misma cuota", () => {
    const snaps = buildSnapshots(rows, noPaid, rule, toDate("2026-11-10"));
    const mora = snaps[0].currentMora;
    const applied = applyPayment(snaps, mora + 100000);
    const types = applied.allocations.map((a) => a.type);
    expect(types).toEqual(["MORA", "INTERES"]);
    expect(applied.allocations[0].amount).toBeCloseTo(mora, 2);
    expect(applied.allocations[1].amount).toBe(100000);
  });

  it("reparte el sobrante entre varias cuotas", () => {
    // 1.000.000 cubre la cuota 1 (472.797,98) y se desborda a la 2 y a la 3.
    const snaps = buildSnapshots(rows, noPaid, rule, toDate("2026-09-20"));
    const applied = applyPayment(snaps, 1_000_000);
    const periods = new Set(applied.allocations.map((a) => a.period));
    expect(periods.size).toBe(3);
    expect(Math.min(...periods)).toBe(1);
    expect(Math.max(...periods)).toBe(3);
  });

  it("devuelve el sobrante sin aplicar cuando la cuota queda cubierta", () => {
    const snaps = buildSnapshots(rows, noPaid, rule, toDate("2026-09-20"));
    const applied = applyPayment(snaps, 10_000_000);
    expect(applied.unapplied).toBeGreaterThan(0);
    expect(applied.allocations.reduce((a, x) => a + x.amount, 0)).toBeLessThan(10_000_000);
  });

  it("no imputa nada con monto cero o negativo", () => {
    const snaps = buildSnapshots(rows, noPaid, rule, toDate("2026-09-20"));
    expect(applyPayment(snaps, 0).allocations).toHaveLength(0);
    expect(applyPayment(snaps, -500).allocations).toHaveLength(0);
  });

  it("un pago exacto liquida la cuota y no deja residuo", () => {
    const rows2 = generateSchedule({ ...terms, rate: 0 });
    const snaps = buildSnapshots(rows2, noPaid, DEFAULT_MORA_RULE, toDate("2026-09-20"));
    const cuota = snaps[0].row.scheduledPayment;
    const applied = applyPayment(snaps, cuota);
    expect(applied.unapplied).toBe(0);
  });

  it("saldar todo el préstamo con un solo pago deja saldo cero", () => {
    const snaps = buildSnapshots(rows, noPaid, DEFAULT_MORA_RULE, toDate("2026-09-20"));
    const total = snaps.reduce((a, s) => a + s.outstanding, 0);
    const applied = applyPayment(snaps, total);
    expect(applied.unapplied).toBe(0);
    expect(money(applied.allocations.reduce((a, x) => a + x.amount, 0)).toNumber())
      .toBeCloseTo(money(total).toNumber(), 2);
  });
});

describe("Abonos extraordinarios", () => {
  it("reduce el capital de la cuota más antigua", () => {
    const rows = generateSchedule(terms);
    const withExtra = applyExtraPrincipal(rows, 1_000_000);
    expect(withExtra[0].extraPrincipal).toBe(1_000_000);
    expect(withExtra[0].closingBalance).toBeCloseTo(rows[0].closingBalance - 1_000_000, 4);
  });

  it("propaga el saldo a los períodos siguientes", () => {
    const rows = generateSchedule(terms);
    const withExtra = applyExtraPrincipal(rows, 1_000_000);
    expect(withExtra[1].openingBalance).toBe(withExtra[0].closingBalance);
  });

  it("un abono mayor al saldo no genera saldo negativo", () => {
    const rows = generateSchedule(terms);
    const withExtra = applyExtraPrincipal(rows, 99_000_000);
    for (const r of withExtra) expect(r.closingBalance).toBeGreaterThanOrEqual(0);
  });

  it("sin abono devuelve el cronograma intacto", () => {
    const rows = generateSchedule(terms);
    expect(applyExtraPrincipal(rows, 0)).toEqual(rows);
  });
});

describe("Resumen de cartera", () => {
  it("calcula capital, interés y mora por cobrar", () => {
    const rows = generateSchedule(terms);
    const rule: MoraRule = { ...DEFAULT_MORA_RULE, dailyRatePercent: 1 };
    const snaps = buildSnapshots(rows, noPaid, rule, toDate("2026-11-10"));
    const summary = portfolioSummary(snaps);
    expect(summary.activeLoans).toBe(1);
    expect(summary.principalOutstanding).toBeGreaterThan(0);
    expect(summary.overdueCount).toBeGreaterThan(0);
    expect(summary.moraAccrued).toBeGreaterThan(0);
  });

  it("un préstamo recién desembolsado no tiene mora", () => {
    const rows = generateSchedule(terms);
    const snaps = buildSnapshots(rows, noPaid, DEFAULT_MORA_RULE, toDate("2026-09-05"));
    const summary = portfolioSummary(snaps);
    expect(summary.moraAccrued).toBe(0);
    expect(summary.overdueCount).toBe(0);
  });

  it("tras pagar todo, el capital pendiente queda en cero", () => {
    const rows = generateSchedule(terms);
    const snaps = buildSnapshots(rows, noPaid, DEFAULT_MORA_RULE, toDate("2026-09-20"));
    const paid = new Map(snaps.map((s) => [s.row.period, { mora: 0, interest: s.row.interest, principal: s.row.principal }]));
    const after = buildSnapshots(rows, paid, DEFAULT_MORA_RULE, toDate("2026-09-20"));
    expect(outstandingBalance(after)).toBe(0);
    expect(portfolioSummary(after).principalOutstanding).toBe(0);
  });
});

describe("Precisión acumulada en la imputación", () => {
  it("no pierde centavos al pagar las cuotas una a una", () => {
    const rows2 = generateSchedule(terms);
    const paid = new Map<number, { mora: number; interest: number; principal: number }>();
    const asOf = toDate("2026-09-20");

    for (const row of rows2) {
      const before = buildSnapshots(rows2, paid, DEFAULT_MORA_RULE, asOf);
      const applied = applyPayment(before, row.scheduledPayment);
      for (const a of applied.allocations) {
        const acc = paid.get(a.period) ?? { mora: 0, interest: 0, principal: 0 };
        if (a.type === "MORA") acc.mora += a.amount;
        if (a.type === "INTERES") acc.interest += a.amount;
        if (a.type === "CAPITAL") acc.principal += a.amount;
        paid.set(a.period, acc);
      }
    }

    const remaining = outstandingBalance(buildSnapshots(rows2, paid, DEFAULT_MORA_RULE, asOf));
    expect(money(remaining).toNumber()).toBeLessThanOrEqual(1);
  });

  it("cada cuota queda exactamente en PAGADA tras imputar su total", () => {
    const rows2 = generateSchedule(terms);
    const paid = new Map<number, { mora: number; interest: number; principal: number }>();
    const asOf = toDate("2026-09-20");
    const total = scheduleTotals(rows2).totalScheduled;

    const applied = applyPayment(buildSnapshots(rows2, paid, DEFAULT_MORA_RULE, asOf), total);
    for (const a of applied.allocations) {
      const acc = paid.get(a.period) ?? { mora: 0, interest: 0, principal: 0 };
      if (a.type === "MORA") acc.mora += a.amount;
      if (a.type === "INTERES") acc.interest += a.amount;
      if (a.type === "CAPITAL") acc.principal += a.amount;
      paid.set(a.period, acc);
    }

    const snaps = buildSnapshots(rows2, paid, DEFAULT_MORA_RULE, asOf);
    expect(snaps.every((s) => s.status === "PAGADA")).toBe(true);
    expect(outstandingBalance(snaps)).toBeLessThanOrEqual(1);
  });
});

describe("Desglose en tiempo real al pagar la cuota (previewAllocationBreakdown)", () => {
  const installments = [
    { period: 1, dueDate: "2026-10-01", interestOwed: 30_000, principalOwed: 100_000, moraOwed: 0 },
    { period: 2, dueDate: "2026-11-01", interestOwed: 30_000, principalOwed: 100_000, moraOwed: 0 },
    { period: 3, dueDate: "2026-12-01", interestOwed: 30_000, principalOwed: 100_000, moraOwed: 0 },
    { period: 4, dueDate: "2027-01-01", interestOwed: 30_000, principalOwed: 100_000, moraOwed: 0 },
  ];
  const totalPendingCapital = 400_000;

  it("desglosa exactamente la cuota ordinaria completa (30.000 interés / 100.000 capital)", () => {
    const preview = previewAllocationBreakdown({
      amount: 130_000,
      kind: "CUOTA",
      surplusMode: "ABONO_CAPITAL",
      installments,
      totalPendingCapital,
    });

    expect(preview.toInterest).toBe(30_000);
    expect(preview.toPrincipal).toBe(100_000);
    expect(preview.toMora).toBe(0);
    expect(preview.toExtraCapital).toBe(0);
    expect(preview.unapplied).toBe(0);
    expect(preview.totalApplied).toBe(130_000);
    expect(preview.totalInterestPercent).toBe(23);
    expect(preview.totalPrincipalPercent).toBe(77);
  });

  it("desglosa un pago parcial cubriendo primero interés ordinario", () => {
    const preview = previewAllocationBreakdown({
      amount: 50_000,
      kind: "CUOTA",
      surplusMode: "ABONO_CAPITAL",
      installments,
      totalPendingCapital,
    });

    expect(preview.toInterest).toBe(30_000);
    expect(preview.toPrincipal).toBe(20_000);
    expect(preview.toExtraCapital).toBe(0);
    expect(preview.totalApplied).toBe(50_000);
  });

  it("asigna el excedente de cuota a abono extraordinario a capital", () => {
    const preview = previewAllocationBreakdown({
      amount: 180_000,
      kind: "CUOTA",
      surplusMode: "ABONO_CAPITAL",
      installments,
      totalPendingCapital,
    });

    expect(preview.toInterest).toBe(30_000);
    expect(preview.toPrincipal).toBe(100_000);
    expect(preview.toExtraCapital).toBe(50_000); // 50.000 sobrantes van directo a reducir capital
    expect(preview.totalApplied).toBe(180_000);
  });

  it("un abono directo a capital va 100% a reducir capital sin cobrar intereses", () => {
    const preview = previewAllocationBreakdown({
      amount: 150_000,
      kind: "ABONO_CAPITAL",
      installments,
      totalPendingCapital,
    });

    expect(preview.toInterest).toBe(0);
    expect(preview.toPrincipal).toBe(0);
    expect(preview.toExtraCapital).toBe(150_000);
    expect(preview.totalApplied).toBe(150_000);
    expect(preview.totalPrincipalPercent).toBe(100);
    expect(preview.totalInterestPercent).toBe(0);
  });

  it("cubre mora vencida antes que el interés ordinario", () => {
    const installmentsWithMora = [
      { period: 1, dueDate: "2026-09-01", interestOwed: 30_000, principalOwed: 100_000, moraOwed: 15_000 },
    ];
    const preview = previewAllocationBreakdown({
      amount: 40_000,
      kind: "CUOTA",
      surplusMode: "ABONO_CAPITAL",
      installments: installmentsWithMora,
      totalPendingCapital: 100_000,
    });

    expect(preview.toMora).toBe(15_000);
    expect(preview.toInterest).toBe(25_000);
    expect(preview.toPrincipal).toBe(0);
  });
});