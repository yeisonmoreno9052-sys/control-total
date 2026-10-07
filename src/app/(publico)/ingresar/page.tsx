import type { Metadata } from "next";
import { FormularioIngreso } from "./formulario";

export const metadata: Metadata = { title: "Ingresar · Control Total" };

export default function PaginaIngreso() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[radial-gradient(ellipse_at_top,#312e81_0%,#111633_55%,#0a0d22_100%)] px-4 py-10">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-3 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-400 to-violet-500 text-2xl font-bold text-white shadow-lg shadow-indigo-500/40">
            CT
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Control Total</h1>
          <p className="text-indigo-200/80">Ventas, inventario y caja de tu negocio</p>
        </div>
        <div className="rounded-2xl shadow-2xl shadow-black/40">
          <FormularioIngreso />
        </div>
        <p className="text-center text-xs text-indigo-200/60">Desarrollado por EMY TELECOM</p>
      </div>
    </main>
  );
}
