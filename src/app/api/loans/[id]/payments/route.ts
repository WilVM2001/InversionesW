import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { registerPayment } from "@/server/loans";
import { apiRequire, apiError, notFound, plain } from "@/server/api";
import { PAYMENT_METHODS } from "@/domain/types";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await apiRequire("payments:read");
  if (user instanceof NextResponse) return user;

  const { id } = await context.params;
  const payments = await prisma.payment.findMany({
    where: { loanId: id },
    orderBy: { paidAt: "desc" },
    include: { allocations: true },
  });
  return NextResponse.json(plain(payments));
}

const paymentBody = z.object({
  amount: z.number().positive("el monto debe ser mayor que cero"),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha inválida (AAAA-MM-DD)"),
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().max(80).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await apiRequire("payments:write");
  if (user instanceof NextResponse) return user;

  const { id } = await context.params;
  try {
    const body = paymentBody.parse(await request.json());
    const result = await registerPayment({ loanId: id, ...body });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "create",
        entity: "Payment",
        entityId: result.payment.id,
        details: { loanId: id, amount: body.amount, receiptNo: result.payment.receiptNo },
      },
    });

    return NextResponse.json(plain(result), { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("no existe")) return notFound("Préstamo");
    return apiError(error);
  }
}