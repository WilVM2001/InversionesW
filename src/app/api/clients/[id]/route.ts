import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiRequire, notFound, plain } from "@/server/api";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await apiRequire("clients:read");
  if (user instanceof NextResponse) return user;

  const { id } = await context.params;
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      loans: {
        orderBy: { disbursementDate: "desc" },
        include: {
          _count: { select: { payments: true } },
        },
      },
    },
  });
  if (!client) return notFound("Cliente");

  return NextResponse.json(plain(client));
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await apiRequire("clients:write");
  if (user instanceof NextResponse) return user;

  const { id } = await context.params;
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      loans: {
        select: { id: true },
      },
    },
  });
  if (!client) return notFound("Cliente");

  await prisma.$transaction(async (tx) => {
    if (client.loans.length > 0) {
      const loanIds = client.loans.map((l) => l.id);

      const payments = await tx.payment.findMany({
        where: { loanId: { in: loanIds } },
        select: { id: true },
      });
      const paymentIds = payments.map((p) => p.id);

      if (paymentIds.length > 0) {
        await tx.paymentAllocation.deleteMany({
          where: { paymentId: { in: paymentIds } },
        });
      }

      await tx.ledgerEntry.deleteMany({ where: { loanId: { in: loanIds } } });
      await tx.loanEvent.deleteMany({ where: { loanId: { in: loanIds } } });
      await tx.payment.deleteMany({ where: { loanId: { in: loanIds } } });
      await tx.loanInstallment.deleteMany({ where: { loanId: { in: loanIds } } });
      await tx.loan.deleteMany({ where: { id: { in: loanIds } } });
    }

    await tx.auditLog.deleteMany({
      where: { entity: "Client", entityId: client.id },
    });

    await tx.client.delete({ where: { id: client.id } });

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

  return NextResponse.json({ ok: true, deletedId: id });
}