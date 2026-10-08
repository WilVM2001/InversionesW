import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage() {
  const user = await currentUser();
  if (user) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-950 px-4">
      <div className="grid w-full max-w-5xl gap-12 lg:grid-cols-2 lg:items-center">
        <div className="hidden lg:block">
          <p className="text-sm font-semibold tracking-widest text-brand-400 uppercase">
            Inversiones W
          </p>
          <h1 className="mt-4 text-4xl leading-tight font-semibold text-white">
            Control de cartera, amortización y cobranza en un solo lugar.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-ink-400">
            Herramienta interna de administración. Separa capital, interés y mora para
            que sepas exactamente cuánto es rentabilidad y cuánto es dinero que te
            deben.
          </p>
          <dl className="mt-10 grid grid-cols-3 gap-6">
            <div>
              <dt className="text-xs tracking-wide text-ink-500 uppercase">Tasas</dt>
              <dd className="mt-1 text-sm text-ink-300">Configurables</dd>
            </div>
            <div>
              <dt className="text-xs tracking-wide text-ink-500 uppercase">Amortización</dt>
              <dd className="mt-1 text-sm text-ink-300">Simple y compuesta</dd>
            </div>
            <div>
              <dt className="text-xs tracking-wide text-ink-500 uppercase">Acceso</dt>
              <dd className="mt-1 text-sm text-ink-300">Solo personal autorizado</dd>
            </div>
          </dl>
        </div>

        <div className="card w-full p-8">
          <h2 className="text-lg font-semibold text-ink-900">Iniciar sesión</h2>
          <p className="mt-1 mb-6 text-sm text-ink-500">
            Ingresa con las credenciales asignadas por el administrador.
          </p>
          <LoginForm />
        </div>
      </div>
    </main>
  );
}