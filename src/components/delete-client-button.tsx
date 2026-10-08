"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { deleteClientAction, type FormState } from "@/server/actions";
import { Trash2, AlertTriangle, X, Loader2 } from "lucide-react";

function SubmitButton({ loansCount }: { loansCount: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center gap-2 rounded-lg bg-danger-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-danger-700 disabled:opacity-50"
    >
      {pending ? (
        <>
          <Loader2 size={14} className="animate-spin" /> Eliminando...
        </>
      ) : loansCount > 0 ? (
        "Sí, eliminar cliente y sus préstamos"
      ) : (
        "Sí, eliminar cliente"
      )}
    </button>
  );
}

export function DeleteClientButton({
  clientId,
  clientName,
  documentId,
  loansCount = 0,
  variant = "button",
}: {
  clientId: string;
  clientName: string;
  documentId: string;
  loansCount?: number;
  variant?: "button" | "icon";
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [state, formAction] = useActionState<FormState, FormData>(
    deleteClientAction,
    {},
  );

  return (
    <>
      {variant === "button" ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-danger-200 bg-danger-50 px-3.5 py-2 text-xs font-semibold text-danger-700 transition hover:bg-danger-100 hover:text-danger-800 shadow-xs"
        >
          <Trash2 size={14} /> Eliminar cliente
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="rounded-md p-1.5 text-ink-400 hover:bg-danger-50 hover:text-danger-600 transition"
          title={`Eliminar cliente ${clientName}`}
        >
          <Trash2 size={15} />
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="card w-full max-w-md overflow-hidden rounded-2xl p-6 shadow-xl animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-100 text-danger-600">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-ink-900">
                    ¿Eliminar este cliente?
                  </h3>
                  <p className="text-xs text-ink-500">
                    Esta acción es irreversible y removerá el registro.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-md p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-600"
              >
                <X size={18} />
              </button>
            </div>

            {state.error && (
              <div className="mt-4 rounded-lg bg-danger-500/10 p-3 text-xs text-danger-600 ring-1 ring-danger-500/25 ring-inset">
                {state.error}
              </div>
            )}

            <div className="mt-4 rounded-xl bg-ink-50 p-3.5 text-xs text-ink-700 border border-ink-100">
              <p className="font-semibold text-ink-900">
                {clientName}
              </p>
              <p className="text-ink-500 mt-0.5">
                Cédula / Documento: <span className="font-mono">{documentId}</span>
              </p>
              {loansCount > 0 ? (
                <div className="mt-2.5 rounded-lg bg-warning-500/10 p-2.5 text-warning-800 ring-1 ring-warning-500/25 ring-inset">
                  <span className="font-bold">⚠️ Advertencia:</span> Este cliente tiene{" "}
                  <strong>{loansCount} préstamo(s)</strong> registrado(s). Se
                  eliminarán permanentemente todos sus créditos, cronogramas de cuotas y
                  comprobantes de pago vinculados.
                </div>
              ) : (
                <p className="mt-2 text-ink-600">
                  Este cliente no tiene préstamos activos ni historial contable.
                </p>
              )}
            </div>

            <form action={formAction} className="mt-6 flex items-center justify-end gap-3">
              <input type="hidden" name="clientId" value={clientId} />
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg border border-ink-200 bg-white px-4 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-50 transition"
              >
                Cancelar
              </button>
              <SubmitButton loansCount={loansCount} />
            </form>
          </div>
        </div>
      )}
    </>
  );
}
