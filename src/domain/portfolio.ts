import { dec, money } from "./money";

export interface MonthRange {
  year: number;
  month: number; // 1-12
  monthStr: string; // "YYYY-MM"
  startDate: Date;
  endDate: Date;
  label: string; // ej: "Octubre 2026"
}

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

/**
 * Devuelve el rango de fechas en UTC para consultas de un mes específico.
 * monthStr formato: "YYYY-MM".
 */
export function getMonthRange(monthStr?: string): MonthRange {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;

  if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
    const [y, m] = monthStr.split("-").map(Number);
    if (y >= 2000 && y <= 2100 && m >= 1 && m <= 12) {
      year = y;
      month = m;
    }
  }

  const padMonth = String(month).padStart(2, "0");
  const currentMonthStr = `${year}-${padMonth}`;
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1));

  return {
    year,
    month,
    monthStr: currentMonthStr,
    startDate,
    endDate,
    label: `${MONTH_NAMES[month - 1]} ${year}`,
  };
}

export interface MonthlyControlMetrics {
  targetScheduled: number; // Capital + interés de cuotas que vencen en el mes
  targetTotal: number; // Alias de targetScheduled
  targetPrincipal: number;
  targetInterest: number;
  collectedThisMonth: number; // Total recaudado en el mes
  collectedTotal: number; // Alias de collectedThisMonth
  collectedPrincipal: number; // Capital recuperado en el mes
  collectedInterest: number; // Interés cobrado en el mes
  collectedMora: number; // Mora cobrada en el mes
  collectedProfit: number; // Interés + mora cobrados en el mes
  difference: number; // collectedThisMonth - targetScheduled
  compliancePct: number; // (collectedThisMonth / targetScheduled) * 100
  achievementRate: number; // compliancePct / 100
  isAhead: boolean;
}

export function computeMonthlyControl(input: {
  targetPrincipal: number;
  targetInterest: number;
  collectedPrincipal: number;
  collectedInterest: number;
  collectedMora: number;
}): MonthlyControlMetrics {
  const targetScheduled = money(
    dec(input.targetPrincipal).plus(input.targetInterest),
  ).toNumber();
  const collectedPrincipal = money(input.collectedPrincipal).toNumber();
  const collectedInterest = money(input.collectedInterest).toNumber();
  const collectedMora = money(input.collectedMora).toNumber();
  const collectedProfit = money(
    dec(collectedInterest).plus(collectedMora),
  ).toNumber();
  const collectedThisMonth = money(
    dec(collectedPrincipal).plus(collectedProfit),
  ).toNumber();

  const diff = money(dec(collectedThisMonth).minus(targetScheduled)).toNumber();
  const compliancePct =
    targetScheduled > 0
      ? money(dec(collectedThisMonth).dividedBy(targetScheduled).times(100)).toNumber()
      : collectedThisMonth > 0
        ? 100
        : 0;

  return {
    targetScheduled,
    targetTotal: targetScheduled,
    targetPrincipal: money(input.targetPrincipal).toNumber(),
    targetInterest: money(input.targetInterest).toNumber(),
    collectedThisMonth,
    collectedTotal: collectedThisMonth,
    collectedPrincipal,
    collectedInterest,
    collectedMora,
    collectedProfit,
    difference: diff,
    compliancePct,
    achievementRate: compliancePct / 100,
    isAhead: diff >= 0,
  };
}
