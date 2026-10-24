"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { updateClientAction, type FormState } from "@/server/actions";
import { Pencil, X, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export interface ClientDataForEdit {
  id: string;
  documentId: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  occupation?: string | null;
  notes?: string | null;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-brand-700 disabled:opacity-50 cursor-pointer min-h-[44px]"
    >
      {pending ? (
        <>
          <Loader2 size={16} className="animate-spin" /> Guardando cambios...
        </>
      ) : (
        "Guardar Cambios"
      )}
    </button>
  );
}

export function EditClientModal({
  client,
  isOpen,
  onClose,
}: {
  client: ClientDataForEdit;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(updateClientAction, {});

  // Cierra el modal automáticamente tras éxito
  useEffect(() => {
    if (state?.ok) {
      const timer = setTimeout(() => {
        onClose();
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [state?.ok, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-xs">
      <div className="card w-full max-w-lg p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-ink-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-brand-50 p-2 text-brand-600">
              <Pencil size={18} />
            </div>
            <div>
              <h3 className="font-bold text-ink-900 text-base">Editar Cliente</h3>
              <p className="text-xs text-ink-500">Doc. {client.documentId}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-600 cursor-pointer min-h-[40px] min-w-[40px] flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </div>

        {state?.ok && (
          <div className="rounded-lg bg-positive-50 border border-positive-200 p-3 text-xs text-positive-800 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-positive-600 shrink-0" />
            <span className="font-semibold">{state.ok}</span>
          </div>
        )}

        {state?.error && (
          <div className="rounded-lg bg-danger-50 border border-danger-200 p-3 text-xs text-danger-800 flex items-center gap-2">
            <AlertCircle size={16} className="text-danger-600 shrink-0" />
            <span>{state.error}</span>
          </div>
        )}

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="clientId" value={client.id} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="edit-documentId">
                Documento / Cédula *
              </label>
              <input
                id="edit-documentId"
                name="documentId"
                type="text"
                required
                defaultValue={client.documentId}
                className="field min-h-[44px]"
              />
            </div>

            <div>
              <label className="label" htmlFor="edit-phone">
                Teléfono / Celular
              </label>
              <input
                id="edit-phone"
                name="phone"
                type="tel"
                defaultValue={client.phone ?? ""}
                placeholder="3001234567"
                className="field min-h-[44px]"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="edit-firstName">
                Nombres *
              </label>
              <input
                id="edit-firstName"
                name="firstName"
                type="text"
                required
                defaultValue={client.firstName}
                className="field min-h-[44px]"
              />
            </div>

            <div>
              <label className="label" htmlFor="edit-lastName">
                Apellidos *
              </label>
              <input
                id="edit-lastName"
                name="lastName"
                type="text"
                required
                defaultValue={client.lastName}
                className="field min-h-[44px]"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="edit-email">
                Correo Electrónico
              </label>
              <input
                id="edit-email"
                name="email"
                type="email"
                defaultValue={client.email ?? ""}
                placeholder="cliente@ejemplo.com"
                className="field min-h-[44px]"
              />
            </div>

            <div>
              <label className="label" htmlFor="edit-occupation">
                Ocupación o Actividad
              </label>
              <input
                id="edit-occupation"
                name="occupation"
                type="text"
                defaultValue={client.occupation ?? ""}
                placeholder="Comerciante, Empleado..."
                className="field min-h-[44px]"
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="edit-address">
              Dirección de Residencia o Negocio
            </label>
            <input
              id="edit-address"
              name="address"
              type="text"
              defaultValue={client.address ?? ""}
              placeholder="Calle o Carrera, Barrio..."
              className="field min-h-[44px]"
            />
          </div>

          <div>
            <label className="label" htmlFor="edit-notes">
              Notas u Observaciones
            </label>
            <textarea
              id="edit-notes"
              name="notes"
              rows={2}
              defaultValue={client.notes ?? ""}
              placeholder="Anotaciones internas del cliente..."
              className="field"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-ink-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-ink-200 px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50 cursor-pointer min-h-[44px]"
            >
              Cancelar
            </button>
            <SubmitButton />
          </div>
        </form>
      </div>
    </div>
  );
}
