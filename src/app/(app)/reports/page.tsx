import { requirePermission } from "@/server/auth";
import { prisma } from "@/lib/prisma";
import { formatCOP, formatCOPWhole } from "@/components/format";
import { StatCard } from "@/components/ui";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  await requirePermission("reports:read");
  const { year } = await searchParams;
  const currentYear = new Date().getFullYear();
  const selected = Number(year) || currentYear;

  const [byCategory, byMonth, activeLoans, byMethod] = await Promise.all([
    prisma.ledgerEntry.groupBy({
      by: ["category"],
      where: {
        direction: "INGRESO",
        entryDate: { gte: new Date(selected, 0, 1), lt: new Date(selected + 1, 0, 1) },
      },
      _sum: { amount: true },
    }),
    prisma.$queryRaw<{ month: string; category: string; total: string }[]>`
      SELECT to_char("entryDate", 'YYYY-MM') AS month,
             category,
             SUM(amount)::text AS total
      FROM ledger_entries
      WHERE direction = 'INGRESO'
        AND "entryDate" >= ${`${selected}-01-01`}
        AND "entryDate" < ${`${selected + 1}-01-01`}
      GROUP BY 1, 2
      ORDER BY 1
    `,
    prisma.loan.count({ where: { status: "VIGENTE" } }),
    prisma.payment.groupBy({ by: ["method"], _sum: { amount: true } }),
  ]);

  const cat = new Map(byCategory.map((c) => [c.category, Number(c._sum.amount ?? 0)]));
  const capital = cat.get("CAPITAL") ?? 0;
  const interes = cat.get("INTERES") ?? 0;
  const mora = cat.get("MORA") ?? 0;
  const utilidad = interes + mora;

  const months = new Map<string, { capital: number; interes: number }>();
  for (const row of byMonth) {
    const e = months.get(row.month) ?? { capital: 0, interes: 0 };
    if (row.category === "CAPITAL") e.capital += Number(row.total);
    else e.interes += Number(row.total);
    months.set(row.month, e);
  }

  const years = [currentYear - 2, currentYear - 1, currentYear];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">Reportes</h1>
          <p className="mt-1 text-sm text-ink-500">
            El capital recuperado se separa del interés: solo el segundo es utilidad.
          </p>
        </div>
        <nav className="flex gap-2">
          {years.map((y) => (
            <a
              key={y}
              href={`/reports?year=${y}`}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                y === selected
                  ? "bg-ink-900 text-white"
                  : "bg-white text-ink-600 ring-1 ring-ink-200 ring-inset hover:bg-ink-50"
              }`}
            >
              {y}
            </a>
          ))}
        </nav>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Capital recuperado" value={capital} />
        <StatCard label="Interés cobrado" value={interes} tone="positive" />
        <StatCard label="Mora cobrada" value={mora} tone={mora > 0 ? "warning" : "default"} />
        <StatCard label="Utilidad bruta" value={utilidad} tone="positive" />
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-ink-900">
          Detalle mensual de {selected}
        </h2>
        {months.size === 0 ? (
          <p className="mt-6 text-sm text-ink-500">
            No hay movimientos registrados en {selected}.
          </p>
        ) : (
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-left text-xs text-ink-500">
                <th className="pb-2 font-medium">Mes</th>
                <th className="pb-2 text-right font-medium">Capital</th>
                <th className="pb-2 text-right font-medium">Interés y mora</th>
                <th className="pb-2 text-right font-medium">Total cobrado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {[...months.entries()].map(([month, v]) => (
                <tr key={month}>
                  <td className="tabular py-2.5">{month}</td>
                  <td className="tabular py-2.5 text-right">{formatCOP(v.capital)}</td>
                  <td className="tabular py-2.5 text-right text-positive-600">
                    {formatCOP(v.interes)}
                  </td>
                  <td className="tabular py-2.5 text-right font-medium">
                    {formatCOP(v.capital + v.interes)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-ink-900">Métodos de pago</h2>
        {byMethod.length === 0 ? (
          <p className="mt-4 text-sm text-ink-500">Sin pagos registrados.</p>
        ) : (
          <ul className="mt-4 space-y-2.5">
            {byMethod
              .sort((a, b) => Number(b._sum.amount ?? 0) - Number(a._sum.amount ?? 0))
              .map((m) => (
                <li key={m.method} className="flex items-center justify-between text-sm">
                  <span className="text-ink-600">{m.method}</span>
                  <span className="tabular font-medium">
                    {formatCOPWhole(m._sum.amount ?? 0)}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-ink-400">
        {activeLoans} préstamo(s) vigente(s) en la cartera actual.
      </p>
    </div>
  );
}