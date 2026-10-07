import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { SinPermiso } from "@/components/layout/sin-permiso";
import type { CategoriaMovimientoCaja } from "@/generated/prisma/enums";
import { CATEGORIAS_CAJA } from "@/lib/datos/movimientos-caja";
import { diaEnBogota } from "@/lib/formato";
import { exigirModulo } from "@/lib/modulos";
import { puedeGestionar } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { FormularioMovimiento } from "./formulario";

export const metadata: Metadata = { title: "Registrar · Caja · Control Total" };

export default async function NuevoMovimiento({ searchParams }: PageProps<"/caja/nuevo">) {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "CAJA");
  if (!puedeGestionar(ctx) || !ctx.negocioActivoId) return <SinPermiso />;
  const tipo = (await searchParams).tipo === "ingreso" ? "INGRESO" : "EGRESO";
  const categorias = (Object.keys(CATEGORIAS_CAJA) as CategoriaMovimientoCaja[])
    .filter((c) => CATEGORIAS_CAJA[c].tipo === tipo)
    .map((c) => ({ valor: c, nombre: CATEGORIAS_CAJA[c].nombre }));
  return (
    <div>
      <EncabezadoPagina
        titulo={tipo === "EGRESO" ? "Registrar egreso" : "Registrar ingreso"}
        subtitulo={tipo === "EGRESO" ? "Nómina, arriendo, servicios, retiros…" : "Plata que entra y no es una venta."}
        volver={{ href: "/caja", texto: "Caja" }}
      />
      <FormularioMovimiento tipo={tipo} categorias={categorias} hoy={diaEnBogota()} />
    </div>
  );
}
