import { requirePermission } from "@/server/auth";
import { ClientForm } from "@/components/client-form";

export default async function NewClientPage() {
  await requirePermission("clients:write");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink-900">Nuevo cliente</h1>
        <p className="mt-1 text-sm text-ink-500">
          El documento identifica de forma única a la persona.
        </p>
      </header>
      <div className="card p-6">
        <ClientForm />
      </div>
    </div>
  );
}