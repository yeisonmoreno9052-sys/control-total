import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { estadoDeCaja } from "@/lib/datos/caja";
import { obtenerMargenNegocio } from "@/lib/datos/categorias";
import { listarProveedores } from "@/lib/datos/compras";
import { diaEnBogota } from "@/lib/formato";
import { exigirModulo } from "@/lib/modulos";
import { puedeGestionar } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { FacturaCliente } from "./factura-cliente";

export const metadata: Metadata = {
  title: "Registrar factura · Control Total",
};

export default async function NuevaFactura({ searchParams }: PageProps<"/proveedores/facturas/nueva">) {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "PROVEEDORES");
  if (!puedeGestionar(ctx) || !ctx.negocioActivoId) return <SinPermiso />;
  const negocioId = ctx.negocioActivoId;
  const sp = await searchParams;
  const [proveedores, margen, caja] = await Promise.all([
    listarProveedores(ctx, negocioId),
    obtenerMargenNegocio(ctx, negocioId),
    estadoDeCaja(ctx, negocioId),
  ]);

  return (
    <div>
      <EncabezadoPagina titulo="Registrar factura de compra" volver={{ href: "/proveedores", texto: "Facturas" }} />
      <FacturaCliente
        negocioId={negocioId}
        hoy={diaEnBogota()}
        proveedores={proveedores.map((p) => ({ id: p.id, nombre: p.nombre }))}
        proveedorInicial={typeof sp.proveedor === "string" ? sp.proveedor : null}
        margenNegocio={margen}
        cajaAbierta={caja.hoy?.estado === "ABIERTA"}
      />
    </div>
  );
}
