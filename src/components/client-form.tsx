"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createClientAction, type FormState } from "@/server/actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "Guardando..." : "Guardar cliente"}
    </button>
  );
}

export function ClientForm() {
  const [state, formAction] = useActionState<FormState, FormData>(
    createClientAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? (
        <p className="rounded-lg bg-danger-500/10 px-3 py-2 text-sm text-danger-600 ring-1 ring-danger-500/25 ring-inset">
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="documentId">
            Documento
          </label>
          <input id="documentId" name="documentId" required className="field" />
        </div>
        <div>
          <label className="label" htmlFor="phone">
            Teléfono
          </label>
          <input id="phone" name="phone" className="field" placeholder="300 123 4567" />
        </div>
        <div>
          <label className="label" htmlFor="firstName">
            Nombres
          </label>
          <input id="firstName" name="firstName" required className="field" />
        </div>
        <div>
          <label className="label" htmlFor="lastName">
            Apellidos
          </label>
          <input id="lastName" name="lastName" required className="field" />
        </div>
        <div>
          <label className="label" htmlFor="email">
            Correo
          </label>
          <input id="email" name="email" type="email" className="field" />
        </div>
        <div>
          <label className="label" htmlFor="occupation">
            Ocupación
          </label>
          <input id="occupation" name="occupation" className="field" />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="address">
          Dirección
        </label>
        <input id="address" name="address" className="field" />
      </div>

      <div>
        <label className="label" htmlFor="notes">
          Notas internas
        </label>
        <textarea id="notes" name="notes" rows={3} className="field" />
      </div>

      <Submit />
    </form>
  );
}