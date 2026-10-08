import { dec, money } from "@/domain/money";
import { formatDate } from "@/domain/dates";

/**
 * Prisma devuelve los montos NUMERIC como Decimal de decimal.js, no como
 * number. Aceptamos ambos para no obligar a convertir en cada plantilla.
 */
type Numeric = number | string | { toString(): string } | null | undefined;

function toNumber(value: Numeric): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return value;
  return Number(String(value));
}

const COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const COP_WHOLE = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Monto en pesos colombianos. */
export function formatCOP(value: Numeric): string {
  return COP.format(money(toNumber(value)).toNumber());
}

/** Monto sin decimales, para tarjetas grandes donde el centavo no aporta. */
export function formatCOPWhole(value: Numeric): string {
  return COP_WHOLE.format(money(toNumber(value)).toNumber());
}

/** Tasa expresada como fracción -> porcentaje legible: 0.02 -> "2%". */
export function formatRate(fraction: Numeric): string {
  return `${dec(toNumber(fraction)).times(100).toDecimalPlaces(4).toString()}%`;
}

/** Porcentaje ya en unidad porcentual: 1.25 -> "1.25%". */
export function formatPercent(value: Numeric): string {
  return `${dec(toNumber(value)).toDecimalPlaces(4).toString()}%`;
}

export { formatDate };

/** Etiqueta y color de cada estado de cuota. */
export const INSTALLMENT_STYLES: Record<
  string,
  { label: string; className: string }
> = {
  PENDIENTE: {
    label: "Pendiente",
    className: "bg-ink-100 text-ink-600 ring-ink-200",
  },
  PARCIAL: {
    label: "Parcial",
    className: "bg-warning-500/10 text-warning-500 ring-warning-500/25",
  },
  PAGADA: {
    label: "Pagada",
    className: "bg-positive-500/10 text-positive-600 ring-positive-500/25",
  },
  VENCIDA: {
    label: "Vencida",
    className: "bg-danger-500/10 text-danger-600 ring-danger-500/25",
  },
  ANULADA: {
    label: "Anulada",
    className: "bg-ink-100 text-ink-400 ring-ink-200",
  },
};

export const LOAN_STYLES: Record<string, { label: string; className: string }> = {
  VIGENTE: {
    label: "Vigente",
    className: "bg-brand-50 text-brand-700 ring-brand-200",
  },
  PAGADO: {
    label: "Pagado",
    className: "bg-positive-500/10 text-positive-600 ring-positive-500/25",
  },
  REESTRUCTURADO: {
    label: "Reestructurado",
    className: "bg-warning-500/10 text-warning-500 ring-warning-500/25",
  },
  CASTIGADO: {
    label: "Castigado",
    className: "bg-danger-500/10 text-danger-600 ring-danger-500/25",
  },
};

export function Badge({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${className}`}
    >
      {children}
    </span>
  );
}