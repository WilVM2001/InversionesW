import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createLoan } from "@/server/loans";
import { apiRequire, apiError, plain } from "@/server/api";
import { AMORTIZATION_METHODS, FREQUENCIES, INTEREST_TYPES } from "@/domain/types";

export async function GET(request: Request) {
  const user = await apiRequire("loans:read");
  if (user instanceof NextResponse) return user;

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const clientId = url.searchParams.get("clientId");

  const loans = await prisma.loan.findMany({
    where: {
      ...(status ? { status: status as "VIGENTE" } : {}),
      ...(clientId ? { clientId } : {}),
    },
    orderBy: { disbursementDate: "desc" },
    include: { client: true },
  });
  return NextResponse.json(plain(loans));
}

const loanBody = z.object({
  clientId: z.string().min(1, "debe indicar el cliente"),
  rateProfileId: z.string().optional().nullable(),
  principal: z.number().positive("el capital debe ser mayor que cero"),
  ratePercent: z.number().min(0).optional(),
  frequency: z.enum(FREQUENCIES).optional(),
  interestType: z.enum(INTEREST_TYPES).optional(),
  amortizationMethod: z.enum(AMORTIZATION_METHODS).optional(),
  termPeriods: z.number().int().positive("el plazo debe ser mayor que cero"),
  disbursementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha inválida (AAAA-MM-DD)"),
  firstDueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "fecha inválida (AAAA-MM-DD)")
    .optional()
    .nullable(),
  moraDailyRatePercent: z.number().min(0).optional(),
  moraGraceDays: z.number().int().min(0).optional(),
  extraPaymentStrategy: z.enum(["REDUCIR_CUOTA", "REDUCIR_PLAZO"]).optional(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function POST(request: Request) {
  const user = await apiRequire("loans:write");
  if (user instanceof NextResponse) return user;

  try {
    const body = loanBody.parse(await request.json());
    const { loan, totals } = await createLoan(body);

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "create",
        entity: "Loan",
        entityId: loan.id,
        details: { code: loan.code, principal: body.principal, termPeriods: body.termPeriods },
      },
    });

    return NextResponse.json(plain({ loan, totals }), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}