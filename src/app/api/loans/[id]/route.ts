import { NextResponse } from "next/server";
import { loadLoanView } from "@/server/loans";
import { apiRequire, notFound, plain } from "@/server/api";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await apiRequire("loans:read");
  if (user instanceof NextResponse) return user;

  const { id } = await context.params;
  const view = await loadLoanView(id);
  if (!view) return notFound("Préstamo");

  return NextResponse.json(
    plain({
      loan: view.loan,
      client: view.client,
      totals: view.totals,
      summary: view.summary,
      outstanding: view.outstanding,
      collected: view.collected,
      nextDue: view.nextDue,
      schedule: view.rows,
    }),
  );
}