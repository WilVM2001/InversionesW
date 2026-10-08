"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Eye, EyeOff } from "lucide-react";
import { loginAction, type FormState } from "@/server/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "Verificando..." : "Entrar"}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState<FormState, FormData>(loginAction, {});
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <p className="rounded-lg bg-danger-500/10 px-3 py-2 text-sm text-danger-600 ring-1 ring-danger-500/25 ring-inset">
          {state.error}
        </p>
      ) : null}

      <div>
        <label className="label" htmlFor="email">
          Correo
        </label>
        <input
          id="email"
          name="email"
          type="email"
          defaultValue="admin@inversionesw.co"
          autoComplete="username"
          required
          className="field"
          placeholder="admin@inversionesw.co"
        />
      </div>

      <div>
        <label className="label" htmlFor="password">
          Contraseña
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            className="field pr-10"
            placeholder="Tu contraseña"
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-ink-400 hover:text-ink-600"
            tabIndex={-1}
            title={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      <SubmitButton />
    </form>
  );
}