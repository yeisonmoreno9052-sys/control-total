import type { Metadata } from "next";
import { LogOut } from "lucide-react";
import { FormularioContrasena } from "@/components/cuenta/formulario-contrasena";
import { PreferenciaTeclado } from "@/components/cuenta/preferencia-teclado";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { Button } from "@/components/ui/button";
import { listarNegocios } from "@/lib/datos/negocios";
import { ROLES, type RolEmpresa } from "@/lib/datos/usuarios";
import { obtenerContexto } from "@/lib/sesion";
import { salir } from "../acciones";
import { cambiarMiContrasenaAccion } from "./acciones";

export const metadata: Metadata = { title: "Mi cuenta · Control Total" };

export default async function MiCuenta() {
  const ctx = await obtenerContexto();
  const negocios = await listarNegocios(ctx);
  const rol = ROLES[ctx.rol as RolEmpresa];

  return (
    <div className="max-w-xl space-y-6">
      <EncabezadoPagina titulo="Mi cuenta" />
      <section className="flex items-center gap-4 rounded-2xl border p-5">
        <div
          className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl font-semibold text-primary"
          aria-hidden
        >
          {ctx.nombre.trim().charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{ctx.nombre}</p>
          <p className="text-sm text-muted-foreground">
            {rol?.nombre ?? ctx.rol} · {negocios.map((n) => n.nombre).join(", ")}
          </p>
        </div>
      </section>
      <section className="space-y-4 rounded-2xl border p-5 md:p-6">
        <h2 className="text-lg font-semibold">Cambiar mi contraseña</h2>
        <FormularioContrasena accion={cambiarMiContrasenaAccion} pedirActual textoBoton="Cambiar contraseña" />
      </section>
      <section className="space-y-4 rounded-2xl border p-5 md:p-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Teclado de números en la caja</h2>
          <p className="text-sm text-muted-foreground">Para pantallas táctiles: se toca en pantalla en vez de usar el teclado.</p>
        </div>
        <PreferenciaTeclado />
      </section>
      <form action={salir}>
        <Button type="submit" variant="outline" size="lg" className="w-full">
          <LogOut /> Salir del sistema
        </Button>
      </form>
    </div>
  );
}
