import type { Metadata } from "next";
import { FormularioIngreso } from "./formulario";

export const metadata: Metadata = { title: "Ingresar · Control Total" };

export default function PaginaIngreso() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[radial-gradient(ellipse_at_top,#312e81_0%,#111633_55%,#0a0d22_100%)] px-4 py-10">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- ícono fijo, ya optimizado */}
          <img
            src="/iconos/v2/icono.svg"
            alt=""
            className="mx-auto size-24 rounded-[1.4rem] shadow-xl shadow-black/40 ring-1 ring-white/10"
          />
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Control{" "}
            <span className="bg-gradient-to-r from-indigo-300 to-violet-400 bg-clip-text font-extrabold text-transparent">Total</span>
          </h1>
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
