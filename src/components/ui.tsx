import { formatCOP, formatCOPWhole, formatRate } from "./format";

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: "default" | "positive" | "warning" | "danger";
}) {
  const toneClass = {
    default: "text-ink-900",
    positive: "text-positive-600",
    warning: "text-warning-500",
    danger: "text-danger-600",
  }[tone];

  return (
    <div className="card p-4">
      <p className="text-xs font-medium tracking-wide text-ink-500 uppercase">
        {label}
      </p>
      <p className={`tabular mt-2 text-2xl font-semibold ${toneClass}`}>
        {formatCOPWhole(value)}
      </p>
      {hint ? <p className="mt-1 text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}

/**
 * Barra de progreso del capital pagado. Evita el error de las plantillas
 * donde el capital recuperado se confundía con utilidad.
 */
export function PrincipalProgress({
  paid,
  total,
}: {
  paid: number;
  total: number;
}) {
  const pct = total > 0 ? Math.min(100, Math.max(0, (paid / total) * 100)) : 0;
  return (
    <div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-ink-200">
        <div
          className="h-full rounded-full bg-positive-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="tabular mt-1.5 text-xs text-ink-500">
        {formatCOP(paid)} de {formatCOP(total)} capital recuperado
      </p>
    </div>
  );
}

/** Desglose capital / interés / mora, para no mezclarlos en un solo número. */
export function Breakdown({
  capital,
  interes,
  mora,
}: {
  capital: number;
  interes: number;
  mora: number;
}) {
  const items = [
    { label: "Capital", value: capital, className: "text-ink-900" },
    { label: "Interés", value: interes, className: "text-brand-600" },
    { label: "Mora", value: mora, className: "text-danger-600" },
  ];
  return (
    <dl className="space-y-2">
      {items.map((i) => (
        <div key={i.label} className="flex items-baseline justify-between gap-4">
          <dt className="text-sm text-ink-500">{i.label}</dt>
          <dd className={`tabular text-sm font-medium ${i.className}`}>
            {formatCOP(i.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint ? <p className="mt-1 text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-ink-300 bg-white px-6 py-16 text-center">
      <p className="text-sm font-medium text-ink-900">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function RateSummary({
  rate,
  frequency,
  method,
}: {
  rate: number;
  frequency: string;
  method: string;
}) {
  return (
    <span className="tabular text-sm text-ink-600">
      {formatRate(rate)} {frequency.toLowerCase()} ·{" "}
      {method === "ORIGINAL_CAPITAL" ? "sobre capital original" : "sobre saldo insoluto"}
    </span>
  );
}