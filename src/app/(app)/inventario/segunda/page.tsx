import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { estadoDeCaja } from "@/lib/datos/caja";
import { listarCategorias, obtenerMargenNegocio } from "@/lib/datos/categorias";
import { listarProveedores, PROVEEDOR_PARTICULARES } from "@/lib/datos/compras";
import { exigirModulo } from "@/lib/modulos";
import { puedeGestionar } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { FormularioSegunda } from "./formulario-segunda";

export const metadata: Metadata = { title: "Pieza de segunda · Control Total" };

export default async function PiezaSegunda() {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "INVENTARIO");
  if (!puedeGestionar(ctx) || !ctx.negocioActivoId) return <SinPermiso />;
  const negocioId = ctx.negocioActivoId;
  const [categorias, margen, proveedores, caja] = await Promise.all([
    listarCategorias(ctx, negocioId),
    obtenerMargenNegocio(ctx, negocioId),
    listarProveedores(ctx, negocioId),
    estadoDeCaja(ctx, negocioId),
  ]);
  const otros = proveedores.filter((p) => p.nombre.toLowerCase() !== PROVEEDOR_PARTICULARES.toLowerCase());

  return (
    <div className="max-w-3xl">
      <EncabezadoPagina
        titulo="Compré una pieza de segunda"
        subtitulo="Queda en el inventario con su propio código, su costo exacto y la compra anotada."
        volver={{ href: "/inventario", texto: "Inventario" }}
      />
      <FormularioSegunda
        categorias={categorias.map((c) => ({ id: c.id, nombre: c.nombre, margenSugerido: c.margenSugerido }))}
        margenNegocio={margen}
        proveedores={otros.map((p) => ({ id: p.id, nombre: p.nombre }))}
        cajaAbierta={caja.hoy?.estado === "ABIERTA"}
      />
    </div>
  );
}
