import { addPeriods, daysBetween, toDate, toIso } from "./dates";
import Decimal from "decimal.js";
import {
  annuityPayment,
  dec,
  forceClosingBalance,
  internal,
  money,
  totalDueOf,
  type DecimalLike,
} from "./money";
import type { AmortizationMethod, Frequency, LoanTerms, MoraRule, ScheduleRow } from "./types";

/**
 * Mora devengada para una cuota a una fecha de corte.
 * Se calcula sobre el saldo insoluto del período y respeta días de
 * gracia y el tope configurado por el administrador.
 */
export function computeMora(
  principalOutstanding: number,
  rule: MoraRule,
  daysOverdue: number,
): number {
  if (rule.dailyRatePercent <= 0 || daysOverdue <= rule.graceDays) return 0;
  const chargeableDays = daysOverdue - rule.graceDays;
  const base = dec(principalOutstanding).times(rule.dailyRatePercent).dividedBy(100);
  let mora = money(base.times(chargeableDays));
  if (rule.capPercentOfBalance !== null) {
    const cap = money(dec(principalOutstanding).times(rule.capPercentOfBalance).dividedBy(100));
    if (mora.greaterThan(cap)) mora = cap;
  }
  return mora.toNumber();
}

/** Mora de una cuota a una fecha de corte, considerando el saldo real o el interés impago en cuotas de interés puro. */
export function moraAsOf(row: ScheduleRow, rule: MoraRule, asOf: Date): number {
  const daysOverdue = daysBetween(toDate(row.dueDate), asOf);
  if (daysOverdue <= 0) return 0;
  const base = rule.onTotalBalance
    ? totalDueOf(row).toNumber()
    : row.principal > 0
      ? row.closingBalance
      : row.interest;
  return computeMora(base, rule, daysOverdue);
}

/**
 * Fecha de vencimiento de una cuota.
 *
 * Con `firstDueDate` la cuota 1 vence EXACTAMENTE ese día y las siguientes
 * se cuentan desde ahí. Sin ella, la cuota k vence k períodos después del
 * desembolso (comportamiento de las plantillas: EDATE(desembolso, k)).
 */
export function dueDateFor(
  terms: Pick<LoanTerms, "disbursementDate" | "firstDueDate" | "frequency">,
  period: number,
): string {
  if (terms.firstDueDate) {
    return toIso(addPeriods(toDate(terms.firstDueDate), terms.frequency, period - 1));
  }
  return toIso(addPeriods(toDate(terms.disbursementDate), terms.frequency, period));
}

/** Valida las condiciones antes de generar un cronograma. */
export function validateTerms(terms: LoanTerms): void {
  if (!(terms.principal > 0)) throw new Error("El capital del préstamo debe ser mayor que cero.");
  if (!Number.isInteger(terms.termPeriods) || terms.termPeriods <= 0) {
    throw new Error("El plazo del préstamo debe ser mayor que cero.");
  }
  if (!(terms.rate >= 0)) throw new Error("La tasa no puede ser negativa.");
  if (terms.firstDueDate && terms.firstDueDate <= terms.disbursementDate) {
    throw new Error("La fecha del primer cobro debe ser posterior a la fecha de desembolso.");
  }
}

/**
 * Núcleo del cronograma: calcula las filas para un capital, un plazo y unas
 * fechas dadas. Lo usan `generateSchedule` (préstamo nuevo) y el recálculo
 * por abonos a capital (cuotas restantes con nuevo capital).
 *
 * ORIGINAL_CAPITAL    La porción de capital es fija (capital / plazo) y el
 *                     interés se calcula sobre ESA porción, no sobre el
 *                     saldo. La cuota es constante. Equivale a las columnas
 *                     K, L, M y N del prototipo Excel.
 *
 * OUTSTANDING_BALANCE El interés se calcula sobre el saldo insoluto de cada
 *                     período y la porción de capital crece. Equivale a
 *                     PMT + CUMPRINC de la plantilla de Control.
 *
 * En ambos casos la última cuota absorbe el residual para cerrar el saldo
 * en cero, corrigiendo el error de las plantillas donde la fila final
 * quedaba fuera de los rangos de totales.
 */
export function buildRows(
  principalInput: DecimalLike,
  rate: number,
  method: AmortizationMethod,
  dueDates: string[],
  firstPeriod = 1,
): ScheduleRow[] {
  const principal = internal(principalInput).toNumber();
  const term = dueDates.length;
  if (principal <= 0) throw new Error("El capital del préstamo debe ser mayor que cero.");
  if (term <= 0) throw new Error("El plazo del préstamo debe ser mayor que cero.");

  if (method === "BULLET" || method === "INTEREST_ONLY") {
    const rows: ScheduleRow[] = [];
    const decPrincipal = dec(principal);
    const monthlyInterest = internal(decPrincipal.times(rate));

    for (let i = 0; i < term; i += 1) {
      const isLast = i === term - 1;
      const opening = principal;
      const interest = monthlyInterest.toNumber();
      const principalPart = isLast ? principal : 0;
      const scheduled = internal(dec(principalPart).plus(interest)).toNumber();
      const closing = isLast ? 0 : principal;

      const row: ScheduleRow = {
        period: firstPeriod + i,
        dueDate: dueDates[i],
        openingBalance: opening,
        scheduledPayment: scheduled,
        interest,
        principal: principalPart,
        extraPrincipal: 0,
        accruedMora: 0,
        closingBalance: closing,
        totalDue: 0,
      };
      row.totalDue = totalDueOf(row).toNumber();
      rows.push(row);
    }

    forceClosingBalance(rows[rows.length - 1], 0);
    return rows;
  }

  const isFlat = method === "ORIGINAL_CAPITAL";

  // Porción de capital fija (método plano) o cuota fija (método francés).
  const flatPrincipalPortion = internal(dec(principal).dividedBy(term));
  const flatInterestPortion = internal(flatPrincipalPortion.times(rate));
  const fixedPayment = internal(flatPrincipalPortion.plus(flatInterestPortion));
  const annuity = annuityPayment(rate, term, principal);

  const rows: ScheduleRow[] = [];
  let balance = dec(principal);

  for (let i = 0; i < term; i += 1) {
    const opening = internal(balance).toNumber();

    const interest = isFlat
      ? flatInterestPortion.toNumber()
      : internal(dec(opening).times(rate)).toNumber();

    const scheduled = isFlat ? fixedPayment.toNumber() : annuity.toNumber();

    let principalPart = internal(dec(scheduled).minus(interest));
    if (principalPart.lessThan(0)) principalPart = internal(0);
    if (principalPart.greaterThan(opening)) principalPart = internal(opening);

    const closing = internal(dec(opening).minus(principalPart)).toNumber();

    const row: ScheduleRow = {
      period: firstPeriod + i,
      dueDate: dueDates[i],
      openingBalance: opening,
      scheduledPayment: scheduled,
      interest,
      principal: principalPart.toNumber(),
      extraPrincipal: 0,
      accruedMora: 0,
      closingBalance: closing,
      totalDue: 0,
    };
    row.totalDue = totalDueOf(row).toNumber();

    balance = dec(closing);
    rows.push(row);
  }

  forceClosingBalance(rows[rows.length - 1], 0);
  return rows;
}

/** Genera el cronograma completo de un préstamo nuevo. */
export function generateSchedule(terms: LoanTerms): ScheduleRow[] {
  validateTerms(terms);
  const dueDates = Array.from({ length: terms.termPeriods }, (_, i) => dueDateFor(terms, i + 1));
  return buildRows(terms.principal, terms.rate, terms.amortizationMethod, dueDates);
}

export interface BulletInstallment {
  installmentNumber: number;
  dueDate: Date;
  interestAmount: Decimal;
  principalAmount: Decimal;
  totalDue: Decimal;
  remainingPrincipal: Decimal;
}

/**
 * Genera el cronograma de un préstamo de Interés Puro (o Bullet sin amortización intermedia)
 * utilizando Decimal.js directamente con alta precisión.
 */
export function generateInterestOnlySchedule(params: {
  principal: Decimal;
  ratePerPeriod: Decimal; // Ej: 0.02 para 2%
  numberOfInstallments: number;
  firstDueDate: Date;
  addPeriodFn: (date: Date, periodIndex: number) => Date;
}): BulletInstallment[] {
  const { principal, ratePerPeriod, numberOfInstallments, firstDueDate, addPeriodFn } = params;

  // Cuota fija de solo interés: Capital * Tasa
  const interestPayment = principal.mul(ratePerPeriod).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const installments: BulletInstallment[] = [];

  for (let i = 1; i <= numberOfInstallments; i++) {
    const isLast = i === numberOfInstallments;
    const dueDate = addPeriodFn(firstDueDate, i - 1);

    // En cuotas intermedias el capital a cobrar es 0
    // En la última cuota (si se liquida al final) se cobra el capital completo,
    // o 0 si el crédito es indefinido/renovable por intereses.
    const principalDue = isLast ? principal : new Decimal(0);
    const totalDue = interestPayment.plus(principalDue);
    const remaining = isLast ? new Decimal(0) : principal;

    installments.push({
      installmentNumber: i,
      dueDate,
      interestAmount: interestPayment,
      principalAmount: principalDue,
      totalDue,
      remainingPrincipal: remaining,
    });
  }

  return installments;
}

/** Totales del cronograma, útiles para tarjetas de resumen y reportes. */
export interface ScheduleTotals {
  totalScheduled: number;
  totalInterest: number;
  totalPrincipal: number;
}

export function scheduleTotals(rows: ScheduleRow[]): ScheduleTotals {
  return rows.reduce<ScheduleTotals>(
    (acc, r) => ({
      totalScheduled: internal(dec(acc.totalScheduled).plus(r.scheduledPayment)).toNumber(),
      totalInterest: internal(dec(acc.totalInterest).plus(r.interest)).toNumber(),
      totalPrincipal: internal(dec(acc.totalPrincipal).plus(r.principal)).toNumber(),
    }),
    { totalScheduled: 0, totalInterest: 0, totalPrincipal: 0 },
  );
}

/**
 * Cálculo inverso por cuota deseada:
 * Dado el valor de la cuota deseada (M), el número de cuotas (I) y la tasa pactada (J),
 * despeja el capital a prestar (G):
 * G = (M * I) / (1 + J)
 */
export function solvePrincipalFromPayment(
  payment: number,
  termPeriods: number,
  rateFraction: number,
): number {
  if (payment <= 0 || termPeriods <= 0) return 0;
  const factor = dec(1).plus(rateFraction);
  if (factor.isZero()) return 0;
  const total = dec(payment).times(termPeriods);
  return money(total.dividedBy(factor)).toNumber();
}

/**
 * Aplica abonos extraordinarios al cronograma.
 * Cada abono reduce el capital de la cuota más antigua que tenga saldo
 * y propaga el efecto hacia los períodos siguientes.
 */
export function applyExtraPrincipal(rows: ScheduleRow[], extra: number): ScheduleRow[] {
  if (extra <= 0) return rows;
  let remaining = money(extra);
  const next = rows.map((r) => ({ ...r }));

  for (const row of next) {
    if (remaining.lte(0)) break;
    if (row.closingBalance <= 0) continue;
    const absorbable = money(dec(row.closingBalance).minus(row.extraPrincipal));
    const applied = remaining.lessThanOrEqualTo(absorbable) ? remaining : absorbable;
    row.extraPrincipal = money(dec(row.extraPrincipal).plus(applied)).toNumber();
    row.closingBalance = money(dec(row.closingBalance).minus(applied)).toNumber();
    row.totalDue = totalDueOf(row).toNumber();
    remaining = money(remaining.minus(applied));
  }

  // Propagar el nuevo saldo hacia adelante en los períodos con saldo vivo.
  for (let i = 1; i < next.length; i += 1) {
    if (next[i - 1].closingBalance <= 0) continue;
    next[i].openingBalance = next[i - 1].closingBalance;
  }

  return next;
}

export interface RenewBulletScheduleInput {
  lastMaturityRow: ScheduleRow;
  newTermMonths: number;
  rate: number;
  frequency: Frequency;
  capitalRemaining?: number;
}

export interface RenewBulletScheduleResult {
  updatedLastRow: ScheduleRow;
  newRows: ScheduleRow[];
}

/**
 * Prórroga / Renovación de un préstamo BULLET:
 * Convierte la cuota de vencimiento actual en una cuota ordinaria de solo interés
 * y anexa N nuevos períodos manteniendo el interés mensual periódico sobre el
 * capital aplazado, trasladando el vencimiento del capital a la última cuota prorrogada.
 */
export function renewBulletSchedule(input: RenewBulletScheduleInput): RenewBulletScheduleResult {
  const { lastMaturityRow, newTermMonths, rate, frequency } = input;
  if (newTermMonths < 1) {
    throw new Error("El plazo de prórroga debe ser de al menos 1 período.");
  }

  // Capital que se aplaza
  const principal =
    input.capitalRemaining != null && input.capitalRemaining > 0
      ? money(input.capitalRemaining)
      : dec(lastMaturityRow.principal).gt(0)
        ? money(lastMaturityRow.principal)
        : money(lastMaturityRow.openingBalance);

  const rateDec = dec(rate);
  const im = money(principal.times(rateDec));

  // La cuota de vencimiento anterior pasa a ser cuota ordinaria de solo interés
  const updatedLastRow: ScheduleRow = {
    ...lastMaturityRow,
    openingBalance: principal.toNumber(),
    scheduledPayment: im.toNumber(),
    interest: im.toNumber(),
    principal: 0,
    closingBalance: principal.toNumber(),
    totalDue: internal(im.plus(lastMaturityRow.accruedMora)).toNumber(),
  };

  const newRows: ScheduleRow[] = [];
  const baseDate = toDate(lastMaturityRow.dueDate);

  for (let k = 1; k <= newTermMonths; k += 1) {
    const isFinal = k === newTermMonths;
    const period = lastMaturityRow.period + k;
    const dueDate = toIso(addPeriods(baseDate, frequency, k));

    if (!isFinal) {
      newRows.push({
        period,
        dueDate,
        openingBalance: principal.toNumber(),
        scheduledPayment: im.toNumber(),
        interest: im.toNumber(),
        principal: 0,
        extraPrincipal: 0,
        accruedMora: 0,
        closingBalance: principal.toNumber(),
        totalDue: im.toNumber(),
      });
    } else {
      const scheduledPayment = money(principal.plus(im)).toNumber();
      newRows.push({
        period,
        dueDate,
        openingBalance: principal.toNumber(),
        scheduledPayment,
        interest: im.toNumber(),
        principal: principal.toNumber(),
        extraPrincipal: 0,
        accruedMora: 0,
        closingBalance: 0,
        totalDue: scheduledPayment,
      });
    }
  }

  return { updatedLastRow, newRows };
}
