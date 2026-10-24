import { notFound } from "next/navigation";
import { requirePermission } from "@/server/auth";
import { prisma } from "@/lib/prisma";
import { listRates } from "@/server/queries";
import { dbDateToIso } from "@/domain/dates";
import { EditLoanForm, type InitialLoanData } from "@/components/edit-loan-form";
import type { AmortizationMethod, ExtraPaymentStrategy, Frequency, InterestType } from "@/domain/types";

export default async function EditLoanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("loans:write");
  const { id } = await params;

  const [loan, clients, rates] = await Promise.all([
    prisma.loan.findUnique({
      where: { id },
      include: {
        client: true,
        payments: true,
        installments: true,
      },
    }),
    prisma.client.findMany({
      where: { isActive: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, documentId: true },
    }),
    listRates(),
  ]);

  if (!loan) notFound();

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

  const initialLoanData: InitialLoanData = {
    id: loan.id,
    code: loan.code,
    clientId: loan.clientId,
    principal: Number(loan.principal),
    ratePercent: Number(loan.rateSnapshot) * 100,
    frequency: loan.frequencySnapshot as Frequency,
    amortizationMethod: loan.methodSnapshot as AmortizationMethod,
    interestType: loan.interestTypeSnapshot as InterestType,
    termPeriods: loan.termPeriods,
    disbursementDate: dbDateToIso(loan.disbursementDate),
    firstDueDate: loan.firstDueDate ? dbDateToIso(loan.firstDueDate) : "",
    moraDailyRatePercent: Number(loan.moraDailyRateSnapshot),
    moraGraceDays: loan.moraGraceDaysSnapshot,
    extraPaymentStrategy: loan.extraStrategySnapshot as ExtraPaymentStrategy,
    status: loan.status,
    notes: loan.notes ?? "",
    paymentsCount: loan.payments.length,
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-xs tracking-wider text-brand-600 uppercase font-bold">
          Gestión de Cartera
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-ink-900">
          Editar Préstamo {loan.code}
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Modifica las condiciones pactadas, cliente o estado del crédito. Los cambios se sincronizan en el cronograma y libro mayor.
        </p>
      </header>

      <div className="card p-6">
        <EditLoanForm
          loan={initialLoanData}
          clients={clients.map((c) => ({
            id: c.id,
            name: `${c.firstName} ${c.lastName}`,
            documentId: c.documentId,
          }))}
          rates={activeRates}
        />
      </div>
    </div>
  );
}
