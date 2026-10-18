"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Error en la aplicación:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 px-4">
      <div className="card w-full max-w-md p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-danger-500/10 text-danger-500 ring-1 ring-danger-500/20">
          <AlertTriangle size={28} />
        </div>
        <h2 className="mt-5 text-xl font-semibold text-white">
          Ocurrió un problema
        </h2>
        <p className="mt-2 text-sm text-ink-400">
          {error.message ||
            "No se pudo completar la operación solicitada. Por favor, intenta de nuevo."}
        </p>
        {error.digest ? (
          <p className="mt-2 text-xs font-mono text-ink-500">
            Código de referencia: {error.digest}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col gap-3">
          <button
            onClick={() => reset()}
            className="flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            <RotateCcw size={16} />
            Reintentar
          </button>
          <a
            href="/login"
            className="rounded-lg border border-ink-800 px-4 py-2.5 text-sm font-medium text-ink-300 hover:bg-ink-900"
          >
            Volver al inicio
          </a>
        </div>
      </div>
    </div>
  );
}
