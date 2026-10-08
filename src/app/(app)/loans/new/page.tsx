import Link from "next/link";
import { requirePermission } from "@/server/auth";
import { prisma } from "@/lib/prisma";
import { listRates } from "@/server/queries";
import { LoanForm } from "@/components/loan-form";
import { EmptyState } from "@/components/ui";

export default async function NewLoanPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  await requirePermission("loans:write");
  const { clientId } = await searchParams;

  const [clients, rates] = await Promise.all([
    prisma.client.findMany({
      where: { isActive: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, documentId: true },
    }),
    listRates(),
  ]);

  const activeRates = rates
    .filter((r) => r.isActive)
    .map((r) => ({
      id: r.id,
      name: r.name,
      rate: Number(r.rate),
      frequency: r.frequency,
      amortizationMethod: r.amortizationMethod,
      interestType: r.interestType,
      moraDailyRatePercent: Number(r.moraDailyRatePercent),
      moraGraceDays: r.moraGraceDays,
      extraPaymentStrategy: r.extraPaymentStrategy,
    }));

  if (clients.length === 0) {
    return (
      <EmptyState
        title="Primero registra un cliente"
        description="Un préstamo siempre pertenece a una persona."
        action={
          <Link
            href="/clients/new"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Nuevo cliente
          </Link>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink-900">Nuevo préstamo</h1>
        <p className="mt-1 text-sm text-ink-500">
          El cronograma se genera automáticamente con las condiciones de la tasa
          seleccionada, que quedan congeladas en este préstamo.
        </p>
      </header>

      <div className="card p-6">
        <LoanForm
          clients={clients.map((c) => ({
            id: c.id,
            name: `${c.firstName} ${c.lastName}`,
            documentId: c.documentId,
          }))}
          rates={activeRates}
          defaultClientId={clientId}
        />
      </div>
    </div>
  );
}