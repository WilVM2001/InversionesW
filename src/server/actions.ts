"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { can, requireUser } from "@/server/auth";
import { createLoan, registerPayment } from "@/server/loans";
import { parseMoneyInput, parsePercentInput, parseIntegerInput } from "@/domain/parse";
import { formatCOP } from "@/components/format";
import { Prisma } from "@/generated/prisma/client";

export interface FormState {
  error?: string;
  ok?: string;
}

function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function moneyField(form: FormData, key: string): number {
  const val = parseMoneyInput(str(form, key));
  return val ? val.toNumber() : 0;
}

function percentField(form: FormData, key: string): number {
  const val = parsePercentInput(str(form, key));
  return val ? val.toNumber() : 0;
}

function intField(form: FormData, key: string): number {
  const val = parseIntegerInput(str(form, key));
  return val ?? 0;
}

// ---------------------------------------------------------------------------
// Sesión
// ---------------------------------------------------------------------------

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  const email = str(form, "email").toLowerCase();
  const password = str(form, "password");

  if (!email || !password) return { error: "Ingresa tu correo y contraseña." };

  const user = await prisma.user.findUnique({ where: { email } });
  const { compare } = await import("bcryptjs");
  const valid = user ? await compare(password, user.passwordHash) : false;

  if (!user || !valid || !user.isActive) {
    return { error: "Credenciales incorrectas." };
  }

  const { createSession } = await import("@/server/auth");
  await createSession(user.id);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  const { destroySession } = await import("@/server/auth");
  await destroySession();
  redirect("/login");
}

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

const clientSchema = z.object({
  documentId: z.string().min(5, "El documento es obligatorio."),
  firstName: z.string().min(1, "El nombre es obligatorio."),
  lastName: z.string().min(1, "El apellido es obligatorio."),
  phone: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  occupation: z.string().optional(),
  notes: z.string().optional(),
});

export async function createClientAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "clients:write")) return { error: "No tienes permiso." };

  const parsed = clientSchema.safeParse({
    documentId: str(form, "documentId"),
    firstName: str(form, "firstName"),
    lastName: str(form, "lastName"),
    phone: str(form, "phone") || undefined,
    email: str(form, "email") || undefined,
    address: str(form, "address") || undefined,
    occupation: str(form, "occupation") || undefined,
    notes: str(form, "notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const existing = await prisma.client.findUnique({
    where: { documentId: parsed.data.documentId },
  });
  if (existing) return { error: "Ya existe un cliente con ese documento." };

  let clientId = "";
  try {
    const client = await prisma.client.create({ data: parsed.data });
    clientId = client.id;
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "CREATE",
        entity: "Client",
        entityId: client.id,
        details: { documentId: client.documentId },
      },
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error al registrar cliente." };
  }

  revalidatePath("/clients");
  redirect(`/clients/${clientId}`);
}

export async function deleteClientAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "clients:write")) {
    return { error: "No tienes permiso para eliminar clientes." };
  }

  const clientId = str(form, "clientId");
  if (!clientId) return { error: "ID de cliente no proporcionado." };

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      loans: {
        select: { id: true, code: true },
      },
    },
  });

  if (!client) return { error: "El cliente no existe o ya fue eliminado." };

  try {
    await prisma.$transaction(async (tx) => {
      if (client.loans.length > 0) {
        const loanIds = client.loans.map((l) => l.id);

        // 1. Obtener pagos de los préstamos
        const payments = await tx.payment.findMany({
          where: { loanId: { in: loanIds } },
          select: { id: true },
        });
        const paymentIds = payments.map((p) => p.id);

        // 2. Eliminar imputaciones de pago
        if (paymentIds.length > 0) {
          await tx.paymentAllocation.deleteMany({
            where: { paymentId: { in: paymentIds } },
          });
        }

        // 3. Eliminar entradas de libro mayor
        await tx.ledgerEntry.deleteMany({
          where: { loanId: { in: loanIds } },
        });

        // 4. Eliminar eventos de los préstamos
        await tx.loanEvent.deleteMany({
          where: { loanId: { in: loanIds } },
        });

        // 5. Eliminar pagos
        await tx.payment.deleteMany({
          where: { loanId: { in: loanIds } },
        });

        // 6. Eliminar cronogramas de cuotas
        await tx.loanInstallment.deleteMany({
          where: { loanId: { in: loanIds } },
        });

        // 7. Eliminar préstamos
        await tx.loan.deleteMany({
          where: { id: { in: loanIds } },
        });
      }

      // 8. Eliminar logs de auditoría huérfanos del cliente
      await tx.auditLog.deleteMany({
        where: { entity: "Client", entityId: client.id },
      });

      // 9. Eliminar el cliente
      await tx.client.delete({
        where: { id: client.id },
      });

      // 10. Registrar auditoría de la eliminación
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "DELETE",
          entity: "Client",
          entityId: client.id,
          details: {
            documentId: client.documentId,
            fullName: `${client.firstName} ${client.lastName}`,
            loansDeleted: client.loans.length,
          },
        },
      });
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error al eliminar el cliente." };
  }

  revalidatePath("/clients");
  revalidatePath("/dashboard");
  revalidatePath("/loans");
  redirect("/clients");
}

// ---------------------------------------------------------------------------
// Préstamos
// ---------------------------------------------------------------------------

const loanSchema = z.object({
  clientId: z.string().min(1, "Selecciona un cliente."),
  rateProfileId: z.string().optional().nullable(),
  principal: z.number().positive("El capital debe ser mayor que cero."),
  ratePercent: z.number().min(0, "La tasa no puede ser negativa."),
  frequency: z.enum([
    "DIARIA",
    "SEMANAL",
    "QUINCENAL",
    "MENSUAL",
    "BIMESTRAL",
    "TRIMESTRAL",
    "SEMESTRAL",
    "ANUAL",
  ]),
  interestType: z.enum(["SIMPLE", "COMPUESTA"]),
  amortizationMethod: z.enum(["ORIGINAL_CAPITAL", "OUTSTANDING_BALANCE"]),
  termPeriods: z.number().int().positive("El plazo debe ser mayor que cero."),
  disbursementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha de desembolso inválida."),
  firstDueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha de primer cobro inválida.")
    .optional()
    .nullable(),
  moraDailyRatePercent: z.number().min(0).default(0),
  moraGraceDays: z.number().int().min(0).default(0),
  extraPaymentStrategy: z.enum(["REDUCIR_CUOTA", "REDUCIR_PLAZO"]).default("REDUCIR_CUOTA"),
  notes: z.string().optional(),
});

export async function createLoanAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "loans:write")) return { error: "No tienes permiso." };

  const parsed = loanSchema.safeParse({
    clientId: str(form, "clientId"),
    rateProfileId: str(form, "rateProfileId") || null,
    principal: moneyField(form, "principal"),
    ratePercent: percentField(form, "ratePercent"),
    frequency: str(form, "frequency") || "MENSUAL",
    interestType: str(form, "interestType") || "COMPUESTA",
    amortizationMethod: str(form, "amortizationMethod") || "OUTSTANDING_BALANCE",
    termPeriods: intField(form, "termPeriods"),
    disbursementDate: str(form, "disbursementDate"),
    firstDueDate: str(form, "firstDueDate") || null,
    moraDailyRatePercent: percentField(form, "moraDailyRatePercent"),
    moraGraceDays: intField(form, "moraGraceDays"),
    extraPaymentStrategy: (str(form, "extraPaymentStrategy") as "REDUCIR_CUOTA" | "REDUCIR_PLAZO") || "REDUCIR_CUOTA",
    notes: str(form, "notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  let createdLoanId = "";
  try {
    const { loan } = await createLoan({
      clientId: parsed.data.clientId,
      rateProfileId: parsed.data.rateProfileId,
      principal: parsed.data.principal,
      ratePercent: parsed.data.ratePercent,
      frequency: parsed.data.frequency,
      interestType: parsed.data.interestType,
      amortizationMethod: parsed.data.amortizationMethod,
      termPeriods: parsed.data.termPeriods,
      disbursementDate: parsed.data.disbursementDate,
      firstDueDate: parsed.data.firstDueDate,
      moraDailyRatePercent: parsed.data.moraDailyRatePercent,
      moraGraceDays: parsed.data.moraGraceDays,
      extraPaymentStrategy: parsed.data.extraPaymentStrategy,
      notes: parsed.data.notes,
    });
    createdLoanId = loan.id;

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "CREATE",
        entity: "Loan",
        entityId: loan.id,
        details: { code: loan.code, principal: parsed.data.principal },
      },
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo crear el préstamo." };
  }

  revalidatePath("/loans");
  revalidatePath("/dashboard");
  redirect(`/loans/${createdLoanId}`);
}

// ---------------------------------------------------------------------------
// Pagos
// ---------------------------------------------------------------------------

const paymentSchema = z.object({
  loanId: z.string().min(1),
  amount: z.number().positive("El monto debe ser mayor que cero."),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida."),
  method: z.string().min(1, "Selecciona el método de pago."),
  kind: z.enum(["CUOTA", "ABONO_CAPITAL"]).default("CUOTA"),
  surplusMode: z.enum(["ABONO_CAPITAL", "ADELANTAR_CUOTAS"]).default("ABONO_CAPITAL"),
  extraStrategy: z.enum(["REDUCIR_CUOTA", "REDUCIR_PLAZO"]).optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

export async function registerPaymentAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "payments:write")) return { error: "No tienes permiso." };

  const parsed = paymentSchema.safeParse({
    loanId: str(form, "loanId"),
    amount: moneyField(form, "amount"),
    paidAt: str(form, "paidAt"),
    method: str(form, "method"),
    kind: (str(form, "kind") as "CUOTA" | "ABONO_CAPITAL") || "CUOTA",
    surplusMode: (str(form, "surplusMode") as "ABONO_CAPITAL" | "ADELANTAR_CUOTAS") || "ABONO_CAPITAL",
    extraStrategy: (str(form, "extraStrategy") as "REDUCIR_CUOTA" | "REDUCIR_PLAZO") || undefined,
    reference: str(form, "reference") || undefined,
    notes: str(form, "notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    const result = await registerPayment(parsed.data);

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "PAYMENT",
        entity: "Payment",
        entityId: result.payment.id,
        details: {
          amount: parsed.data.amount,
          receiptNo: result.payment.receiptNo,
          extraCapitalAmount: result.extraCapitalAmount,
          isPaidOff: result.isPaidOff,
        },
      },
    });

    revalidatePath(`/loans/${parsed.data.loanId}`);
    revalidatePath("/dashboard");
    revalidatePath("/loans");
    revalidatePath("/clients");

    let msg = `Pago registrado exitosamente en recibo ${result.payment.receiptNo}.`;
    if (result.extraCapitalAmount > 0) {
      msg += ` Se aplicó ${formatCOP(result.extraCapitalAmount)} como abono extraordinario a capital.`;
    }
    if (result.isPaidOff) {
      msg += ` ¡Préstamo totalmente cancelado!`;
    } else if (result.unapplied > 0) {
      msg += ` Sobró ${formatCOP(result.unapplied)} sin aplicar.`;
    }

    return { ok: msg };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo registrar el pago." };
  }
}

// ---------------------------------------------------------------------------
// Tasas
// ---------------------------------------------------------------------------

const rateSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio."),
  description: z.string().optional(),
  ratePercent: z.number().positive("La tasa debe ser mayor que cero."),
  frequency: z.enum([
    "DIARIA",
    "SEMANAL",
    "QUINCENAL",
    "MENSUAL",
    "BIMESTRAL",
    "TRIMESTRAL",
    "SEMESTRAL",
    "ANUAL",
  ]),
  interestType: z.enum(["SIMPLE", "COMPUESTA"]),
  amortizationMethod: z.enum(["ORIGINAL_CAPITAL", "OUTSTANDING_BALANCE"]),
  moraDailyRatePercent: z.number().min(0).default(0),
  moraGraceDays: z.number().int().min(0).default(0),
  extraPaymentStrategy: z.enum(["REDUCIR_CUOTA", "REDUCIR_PLAZO"]).default("REDUCIR_CUOTA"),
});

export async function createRateAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "rates:write")) return { error: "No tienes permiso." };

  const parsed = rateSchema.safeParse({
    name: str(form, "name"),
    description: str(form, "description") || undefined,
    ratePercent: percentField(form, "ratePercent"),
    frequency: str(form, "frequency"),
    interestType: str(form, "interestType"),
    amortizationMethod: str(form, "amortizationMethod"),
    moraDailyRatePercent: percentField(form, "moraDailyRatePercent"),
    moraGraceDays: intField(form, "moraGraceDays"),
    extraPaymentStrategy: (str(form, "extraPaymentStrategy") as "REDUCIR_CUOTA" | "REDUCIR_PLAZO") || "REDUCIR_CUOTA",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const exists = await prisma.rateProfile.findUnique({
    where: { name: parsed.data.name },
  });
  if (exists) return { error: "Ya existe una tasa con ese nombre." };

  await prisma.rateProfile.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      rate: new Prisma.Decimal(parsed.data.ratePercent).dividedBy(100),
      frequency: parsed.data.frequency,
      interestType: parsed.data.interestType,
      amortizationMethod: parsed.data.amortizationMethod,
      moraDailyRatePercent: new Prisma.Decimal(parsed.data.moraDailyRatePercent),
      moraGraceDays: parsed.data.moraGraceDays,
      extraPaymentStrategy: parsed.data.extraPaymentStrategy,
    },
  });

  revalidatePath("/rates");
  return { ok: "Tasa creada exitosamente." };
}

export async function toggleRateAction(form: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "rates:write")) throw new Error("No tienes permiso.");
  const id = str(form, "id");
  const rate = await prisma.rateProfile.findUnique({ where: { id } });
  if (!rate) throw new Error("La tasa no existe.");
  await prisma.rateProfile.update({
    where: { id },
    data: { isActive: !rate.isActive },
  });
  revalidatePath("/rates");
}