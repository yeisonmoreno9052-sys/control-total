import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FormularioContrasena } from "@/components/cuenta/formulario-contrasena";
import { obtenerContextoParaCambio } from "@/lib/sesion";
import { crearContrasenaAccion } from "./acciones";

export const metadata: Metadata = { title: "Crea tu contraseña · Control Total" };

export default function CrearContrasena() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[radial-gradient(ellipse_at_top,#312e81_0%,#111633_55%,#0a0d22_100%)] px-4 py-10">
      <div className="w-full max-w-sm space-y-8">
        <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-background" />}>
          <Contenido />
        </Suspense>
        <p className="text-center text-xs text-indigo-200/60">Desarrollado por EMY TELECOM</p>
      </div>
    </main>
  );
}

async function Contenido() {
  const ctx = await obtenerContextoParaCambio();
  if (!ctx.debeCambiarContrasena) redirect("/panel");
  return (
    <>
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Hola, {ctx.nombre.split(" ")[0]}</h1>
        <p className="text-indigo-200/80">
          Entraste con una contraseña temporal. Crea la tuya para seguir; solo tú la vas a saber.
        </p>
      </div>
      <div className="rounded-2xl bg-background p-6 shadow-2xl shadow-black/40">
        <FormularioContrasena accion={crearContrasenaAccion} pedirActual={false} textoBoton="Guardar y entrar" />
      </div>
    </>
  );
}
