import type { Metadata } from "next";
import { FormularioIngreso } from "./formulario";

export const metadata: Metadata = { title: "Ingresar · Control Total" };

export default function PaginaIngreso() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-muted px-4 py-10">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary text-xl font-bold text-primary-foreground">
            CT
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Control Total</h1>
          <p className="text-muted-foreground">Ingresa con tu usuario y contraseña</p>
        </div>
        <FormularioIngreso />
        <p className="text-center text-xs text-muted-foreground">Desarrollado por EMY TELECOM</p>
      </div>
    </main>
  );
}
