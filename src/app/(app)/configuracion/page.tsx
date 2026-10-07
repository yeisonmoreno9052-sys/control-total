import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { obtenerEmpresa } from "@/lib/datos/empresa";
import { obtenerDatosNegocio } from "@/lib/datos/negocios";
import { puedeGestionar } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { FormularioLogo, FormularioNegocio } from "./formularios";
import { PestanasConfiguracion } from "./pestanas";

export const metadata: Metadata = { title: "Configuración · Control Total" };

export default async function Configuracion() {
  const ctx = await obtenerContexto();
  if (!puedeGestionar(ctx)) return <SinPermiso />;
  const [negocio, empresa] = await Promise.all([
    ctx.negocioActivoId ? obtenerDatosNegocio(ctx, ctx.negocioActivoId) : null,
    obtenerEmpresa(ctx),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <EncabezadoPagina titulo="Configuración" />
        <PestanasConfiguracion activa="/configuracion" rol={ctx.rol} />
      </div>
      {negocio && (
        <section className="space-y-4 rounded-2xl border p-5 md:p-6">
          <div>
            <h2 className="text-lg font-semibold">Datos de {negocio.nombre}</h2>
            <p className="text-sm text-muted-foreground">
              Salen en el recibo. Cada negocio tiene los suyos; para el otro local, cámbialo arriba.
            </p>
          </div>
          <FormularioNegocio key={negocio.id} negocio={negocio} />
        </section>
      )}
      {ctx.rol === "ADMINISTRADOR" && (
        <section className="space-y-4 rounded-2xl border p-5 md:p-6">
          <div>
            <h2 className="text-lg font-semibold">Logo de {empresa?.nombre}</h2>
            <p className="text-sm text-muted-foreground">Es el mismo para todos los negocios.</p>
          </div>
          <FormularioLogo logoUrl={empresa?.logoUrl ?? null} />
        </section>
      )}
    </div>
  );
}
