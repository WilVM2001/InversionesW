import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiRequire, apiError, plain, jsonError } from "@/server/api";

export async function GET() {
  const user = await apiRequire("clients:read");
  if (user instanceof NextResponse) return user;

  const clients = await prisma.client.findMany({
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: { _count: { select: { loans: true } } },
  });
  return NextResponse.json(plain(clients));
}

const clientBody = z.object({
  documentId: z.string().trim().min(6, "documento demasiado corto").max(20),
  firstName: z.string().trim().min(1, "el nombre es obligatorio").max(60),
  lastName: z.string().trim().min(1, "el apellido es obligatorio").max(60),
  phone: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().email("correo inválido").optional().nullable().or(z.literal("")),
  address: z.string().trim().max(160).optional().nullable(),
  occupation: z.string().trim().max(80).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export async function POST(request: Request) {
  const user = await apiRequire("clients:write");
  if (user instanceof NextResponse) return user;

  try {
    const body = clientBody.parse(await request.json());
    const existing = await prisma.client.findUnique({ where: { documentId: body.documentId } });
    if (existing) return jsonError("Ya existe un cliente con ese documento.", 409);

    const client = await prisma.client.create({
      data: {
        ...body,
        email: body.email ? body.email : null,
        isActive: true,
      },
    });
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "create",
        entity: "Client",
        entityId: client.id,
        details: { documentId: client.documentId },
      },
    });
    return NextResponse.json(plain(client), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}