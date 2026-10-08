import Decimal from "decimal.js";
import { daysBetween, toDate } from "./dates";
import { computeMora } from "./amortization";
import { dec, money } from "./money";
import type {
  AllocationType,
  AppliedPayment,
  MoraRule,
  PaymentAllocation,
  ScheduleRow,
} from "./types";

/** Estado de una cuota a una fecha de corte, dado lo ya pagado. */
export interface InstallmentSnapshot {
  row: ScheduleRow;
  /** Cuánto se ha abonado a esta cuota, por concepto. */
  paidMora: number;
  paidInterest: number;
  paidPrincipal: number;
  /** Mora que corre por el retraso a la fecha de corte. */
  currentMora: number;
  status: "PENDIENTE" | "PARCIAL" | "PAGADA" | "VENCIDA" | "ANULADA";
  outstanding: number;
}

export const DEFAULT_ALLOCATION_ORDER: AllocationType[] = [
  "MORA",
  "INTERES",
  "CAPITAL",
  "ABONO_EXTRA",
];

/**
 * Calcula el estado de cada cuota a una fecha de corte.
 * Mora se devenga dinámicamente sobre el saldo que realmente queda
 * pendiente tras imputar los pagos ya registrados.
 */
export function buildSnapshots(
  rows: ScheduleRow[],
  paidByPeriod: Map<number, { mora: number; interest: number; principal: number }>,
  rule: MoraRule,
  asOf: Date,
): InstallmentSnapshot[] {
  return rows.map((row) => {
    const paid = paidByPeriod.get(row.period) ?? { mora: 0, interest: 0, principal: 0 };
    const daysOverdue = daysBetween(toDate(row.dueDate), asOf);

    // La mora corre sobre lo que aún se debe de capital en esa cuota.
    const moraBase = Math.max(0, row.principal - paid.principal);
    const currentMora =
      daysOverdue > 0 ? computeMora(moraBase, rule, daysOverdue) : 0;

    const outstanding = money(
      dec(row.scheduledPayment)
        .plus(row.accruedMora)
        .plus(currentMora)
        .minus(paid.mora)
        .minus(paid.interest)
        .minus(paid.principal),
    ).toNumber();

    const isSettled = paid.mora + paid.interest + paid.principal > 0;
    const fullyPaid =
      money(paid.mora + paid.interest + paid.principal).greaterThanOrEqualTo(
        money(row.scheduledPayment).plus(currentMora),
      ) && currentMora === 0;

    let status: InstallmentSnapshot["status"];
    if (fullyPaid) status = "PAGADA";
    else if (daysOverdue > 0 && outstanding > 0) status = "VENCIDA";
    else if (isSettled && outstanding > 0) status = "PARCIAL";
    else status = "PENDIENTE";

    return {
      row,
      paidMora: money(paid.mora).toNumber(),
      paidInterest: money(paid.interest).toNumber(),
      paidPrincipal: money(paid.principal).toNumber(),
      currentMora,
      status,
      outstanding: Math.max(0, outstanding),
    };
  });
}

/**
 * Imputa un pago sobre el cronograma, de la cuota más antigua a la más
 * reciente, siguiendo el orden de conceptos configurado.
 *
 * El sobrante que no alcanza para la última cuota por pagar se devuelve
 * como `unapplied` para que la interfaz pueda avisar antes de aplicarlo
 * como abono extraordinario.
 */
export function applyPayment(
  snapshots: InstallmentSnapshot[],
  amount: number,
  order: AllocationType[] = DEFAULT_ALLOCATION_ORDER,
): AppliedPayment {
  const allocations: PaymentAllocation[] = [];
  let left = money(amount).toNumber();
  if (left <= 0) return { allocations, unapplied: 0 };

  for (const snap of snapshots) {
    if (left <= 0) break;
    const { row } = snap;
    const remainingMora = money(
      dec(snap.currentMora).plus(row.accruedMora).minus(snap.paidMora),
    ).toNumber();
    const remainingInterest = money(row.interest - snap.paidInterest).toNumber();
    const remainingPrincipal = money(row.principal - snap.paidPrincipal).toNumber();

    const needs: Record<AllocationType, number> = {
      MORA: Math.max(0, remainingMora),
      INTERES: Math.max(0, remainingInterest),
      CAPITAL: Math.max(0, remainingPrincipal),
      ABONO_EXTRA: 0,
    };

    for (const concept of order) {
      if (left <= 0) break;
      const owed = needs[concept];
      if (owed <= 0) continue;
      const applied = money(Math.min(left, owed)).toNumber();
      allocations.push({ period: row.period, type: concept, amount: applied });
      left = money(left - applied).toNumber();
    }
  }

  return { allocations, unapplied: Math.max(0, money(left).toNumber()) };
}

/**
 * Previsualiza el pago sin persistirlo. La interfaz lo usa para mostrar
 * el desglose en vivo antes de confirmar.
 */
export function previewPayment(
  rows: ScheduleRow[],
  paidByPeriod: Map<number, { mora: number; interest: number; principal: number }>,
  rule: MoraRule,
  asOf: Date,
  amount: number,
  order?: AllocationType[],
): { applied: AppliedPayment; snapshots: InstallmentSnapshot[] } {
  const snapshots = buildSnapshots(rows, paidByPeriod, rule, asOf);
  return { applied: applyPayment(snapshots, amount, order), snapshots };
}

/** Saldo total pendiente del préstamo a una fecha de corte. */
export function outstandingBalance(snapshots: InstallmentSnapshot[]): number {
  return money(snapshots.reduce((acc, s) => acc + s.outstanding, 0)).toNumber();
}

/** Resumen de cartera para el dashboard. */
export interface PortfolioSummary {
  activeLoans: number;
  principalOutstanding: number;
  interestExpected: number;
  moraAccrued: number;
  overdueAmount: number;
  overdueCount: number;
}

export function portfolioSummary(snapshots: InstallmentSnapshot[]): PortfolioSummary {
  const pending = snapshots.filter((s) => s.status !== "PAGADA");
  return {
    activeLoans: 1,
    // El capital insoluto es la suma del capital que falta en cada cuota,
    // no el saldo de la última fila, que siempre queda en cero.
    principalOutstanding: money(
      pending.reduce((acc, s) => acc + Math.max(0, s.row.principal - s.paidPrincipal), 0),
    ).toNumber(),
    interestExpected: money(
      pending.reduce((acc, s) => acc + Math.max(0, s.row.interest - s.paidInterest), 0),
    ).toNumber(),
    moraAccrued: money(
      pending.reduce((acc, s) => acc + s.currentMora, 0),
    ).toNumber(),
    overdueAmount: money(
      snapshots.filter((s) => s.status === "VENCIDA").reduce((a, s) => a + s.outstanding, 0),
    ).toNumber(),
    overdueCount: snapshots.filter((s) => s.status === "VENCIDA").length,
  };
}

/** Verifica si todas las cuotas del préstamo están saldadas. */
export function isPaidOff(snapshots: InstallmentSnapshot[]): boolean {
  return snapshots.every((s) => s.status === "PAGADA" || s.outstanding <= 0.01);
}

/**
 * Identifica las cuotas exigibles a la fecha de corte:
 * - Todas las vencidas o que vencen a la fecha de corte con saldo pendiente.
 * - Más la primera cuota futura próxima con saldo pendiente.
 */
export function getExigibleSnapshots(
  snapshots: InstallmentSnapshot[],
  asOf: Date,
): InstallmentSnapshot[] {
  const pending = snapshots.filter((s) => s.outstanding > 0);
  const dueOrPast = pending.filter((s) => toDate(s.row.dueDate) <= asOf);
  const nextFuture = pending.find((s) => toDate(s.row.dueDate) > asOf);

  if (nextFuture && !dueOrPast.some((s) => s.row.period === nextFuture.row.period)) {
    return [...dueOrPast, nextFuture];
  }
  return dueOrPast.length > 0 ? dueOrPast : pending.slice(0, 1);
}

export interface PaymentPlanInput {
  snapshots: InstallmentSnapshot[];
  amount: number;
  kind?: "CUOTA" | "ABONO_CAPITAL";
  surplusMode?: "ABONO_CAPITAL" | "ADELANTAR_CUOTAS";
  asOf: Date;
  order?: AllocationType[];
}

export interface PaymentPlanResult {
  allocations: PaymentAllocation[];
  extraCapitalAmount: number;
  unapplied: number;
  totalApplied: number;
  openSnapshotsForReschedule: InstallmentSnapshot[];
}

/**
 * Planifica la aplicación de un pago diferenciando pago de cuota
 * ordinaria (con destino del excedente) o abono directo a capital.
 */
export function planPayment(input: PaymentPlanInput): PaymentPlanResult {
  const { snapshots, amount, asOf } = input;
  const kind = input.kind ?? "CUOTA";
  const surplusMode = input.surplusMode ?? "ABONO_CAPITAL";
  const order = input.order ?? DEFAULT_ALLOCATION_ORDER;

  if (amount <= 0) {
    return {
      allocations: [],
      extraCapitalAmount: 0,
      unapplied: 0,
      totalApplied: 0,
      openSnapshotsForReschedule: [],
    };
  }

  // Capital total pendiente en cuotas aún no pagadas
  const pendingCapital = money(
    snapshots
      .filter((s) => s.status !== "PAGADA")
      .reduce((acc, s) => acc + Math.max(0, s.row.principal - s.paidPrincipal), 0),
  ).toNumber();

  if (kind === "ABONO_CAPITAL") {
    // Todo va directo a capital de cuotas abiertas
    const extra = Math.min(amount, pendingCapital);
    const unapplied = money(amount - extra).toNumber();
    // Cuotas abiertas que no tienen ningún pago aplicado
    const openSnaps = snapshots.filter(
      (s) => s.status !== "PAGADA" && s.paidPrincipal === 0 && s.paidInterest === 0,
    );

    return {
      allocations: [],
      extraCapitalAmount: extra,
      unapplied: Math.max(0, unapplied),
      totalApplied: extra,
      openSnapshotsForReschedule: openSnaps,
    };
  }

  // Modo CUOTA
  if (surplusMode === "ADELANTAR_CUOTAS") {
    const applied = applyPayment(snapshots, amount, order);
    return {
      allocations: applied.allocations,
      extraCapitalAmount: 0,
      unapplied: applied.unapplied,
      totalApplied: money(amount - applied.unapplied).toNumber(),
      openSnapshotsForReschedule: [],
    };
  }

  // Modo CUOTA con excedente a ABONO_CAPITAL:
  // 1. Cubrir cuotas exigibles (vencidas + próxima cuota)
  const exigibles = getExigibleSnapshots(snapshots, asOf);
  const appliedExigibles = applyPayment(exigibles, amount, order);

  let extraCapitalAmount = 0;
  let unapplied = appliedExigibles.unapplied;

  // Cuotas abiertas estrictamente posteriores a las exigibles
  const maxExigiblePeriod = Math.max(0, ...exigibles.map((e) => e.row.period));
  const openAfterExigibles = snapshots.filter(
    (s) => s.row.period > maxExigiblePeriod && s.status !== "PAGADA",
  );

  const capitalInOpen = money(
    openAfterExigibles.reduce(
      (acc, s) => acc + Math.max(0, s.row.principal - s.paidPrincipal),
      0,
    ),
  ).toNumber();

  if (unapplied > 0 && capitalInOpen > 0) {
    extraCapitalAmount = money(Math.min(unapplied, capitalInOpen)).toNumber();
    unapplied = money(unapplied - extraCapitalAmount).toNumber();
  }

  const totalApplied = money(amount - unapplied).toNumber();

  return {
    allocations: appliedExigibles.allocations,
    extraCapitalAmount,
    unapplied: Math.max(0, unapplied),
    totalApplied,
    openSnapshotsForReschedule: openAfterExigibles,
  };
}

export interface PendingInstallmentSummary {
  period: number;
  dueDate: string;
  interestOwed: number;
  principalOwed: number;
  moraOwed: number;
}

export interface AllocationBreakdownPreview {
  toInterest: number;
  toPrincipal: number;
  toMora: number;
  toExtraCapital: number;
  unapplied: number;
  totalApplied: number;
  totalInterestPercent: number;
  totalPrincipalPercent: number;
}

/**
 * Simula en tiempo real cómo se distribuirá un pago ingresado por el usuario:
 * Cuánto va a interés (ganancia), cuánto a capital (recuperación),
 * cuánto a mora (si aplica) y cuánto a abono extraordinario a capital.
 */
export function previewAllocationBreakdown(input: {
  amount: number;
  kind?: "CUOTA" | "ABONO_CAPITAL";
  surplusMode?: "ABONO_CAPITAL" | "ADELANTAR_CUOTAS";
  installments: PendingInstallmentSummary[];
  totalPendingCapital: number;
}): AllocationBreakdownPreview {
  const { amount, kind = "CUOTA", surplusMode = "ABONO_CAPITAL", installments, totalPendingCapital } = input;

  if (amount <= 0) {
    return {
      toInterest: 0,
      toPrincipal: 0,
      toMora: 0,
      toExtraCapital: 0,
      unapplied: 0,
      totalApplied: 0,
      totalInterestPercent: 0,
      totalPrincipalPercent: 0,
    };
  }

  let left = dec(amount);

  if (kind === "ABONO_CAPITAL") {
    const extra = Decimal.min(left, dec(totalPendingCapital));
    const unapplied = Decimal.max(0, left.minus(extra));
    const extraNum = money(extra).toNumber();
    return {
      toInterest: 0,
      toPrincipal: 0,
      toMora: 0,
      toExtraCapital: extraNum,
      unapplied: money(unapplied).toNumber(),
      totalApplied: extraNum,
      totalInterestPercent: 0,
      totalPrincipalPercent: 100,
    };
  }

  // Modo CUOTA
  if (installments.length === 0) {
    return {
      toInterest: 0,
      toPrincipal: 0,
      toMora: 0,
      toExtraCapital: 0,
      unapplied: money(left).toNumber(),
      totalApplied: 0,
      totalInterestPercent: 0,
      totalPrincipalPercent: 0,
    };
  }

  let totalMora = dec(0);
  let totalInterest = dec(0);
  let totalPrincipal = dec(0);
  let totalExtraCapital = dec(0);

  if (surplusMode === "ADELANTAR_CUOTAS") {
    for (const inst of installments) {
      if (left.lessThanOrEqualTo(0)) break;

      const m = Decimal.min(left, dec(inst.moraOwed));
      totalMora = totalMora.plus(m);
      left = left.minus(m);

      const i = Decimal.min(left, dec(inst.interestOwed));
      totalInterest = totalInterest.plus(i);
      left = left.minus(i);

      const p = Decimal.min(left, dec(inst.principalOwed));
      totalPrincipal = totalPrincipal.plus(p);
      left = left.minus(p);
    }
  } else {
    // surplusMode === "ABONO_CAPITAL":
    // 1. Cubrir la cuota exigible (la primera pendiente)
    const first = installments[0];
    const m = Decimal.min(left, dec(first.moraOwed));
    totalMora = totalMora.plus(m);
    left = left.minus(m);

    const i = Decimal.min(left, dec(first.interestOwed));
    totalInterest = totalInterest.plus(i);
    left = left.minus(i);

    const p = Decimal.min(left, dec(first.principalOwed));
    totalPrincipal = totalPrincipal.plus(p);
    left = left.minus(p);

    // 2. Si sobra, el excedente va a abono extra a capital del saldo insoluto restante
    if (left.greaterThan(0)) {
      const capRemaining = Decimal.max(0, dec(totalPendingCapital).minus(totalPrincipal));
      const extra = Decimal.min(left, capRemaining);
      totalExtraCapital = totalExtraCapital.plus(extra);
      left = left.minus(extra);
    }
  }

  const moraNum = money(totalMora).toNumber();
  const interestNum = money(totalInterest).toNumber();
  const principalNum = money(totalPrincipal).toNumber();
  const extraNum = money(totalExtraCapital).toNumber();
  const unappliedNum = money(Decimal.max(0, left)).toNumber();
  const totalAppliedNum = money(totalMora.plus(totalInterest).plus(totalPrincipal).plus(totalExtraCapital)).toNumber();

  const totalCapitalTotal = principalNum + extraNum;
  const combined = interestNum + totalCapitalTotal;
  const totalInterestPercent = combined > 0 ? Math.round((interestNum / combined) * 100) : 0;
  const totalPrincipalPercent = combined > 0 ? 100 - totalInterestPercent : 0;

  return {
    toInterest: interestNum,
    toPrincipal: principalNum,
    toMora: moraNum,
    toExtraCapital: extraNum,
    unapplied: unappliedNum,
    totalApplied: totalAppliedNum,
    totalInterestPercent,
    totalPrincipalPercent,
  };
}