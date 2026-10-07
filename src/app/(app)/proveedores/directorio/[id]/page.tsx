import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Mail, Pencil, Phone, Plus, User } from "lucide-react";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { EstadoVacio } from "@/components/layout/estado-vacio";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listarFacturas, obtenerProveedor } from "@/lib/datos/compras";
import { formatearDia, formatearPesos } from "@/lib/formato";
import { exigirModulo } from "@/lib/modulos";
import { puedeGestionar } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { cn } from "@/lib/utils";
import { EstadoFactura } from "../../comunes";
import { BotonActivoProveedor } from "./boton-activo";

export const metadata: Metadata = { title: "Proveedor · Control Total" };

export default async function Proveedor({ params }: PageProps<"/proveedores/directorio/[id]">) {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "PROVEEDORES");
  if (!puedeGestionar(ctx)) return <SinPermiso />;
  const { id } = await params;
  const proveedor = await obtenerProveedor(ctx, id);
  if (!proveedor) notFound();
  const { facturas, total } = await listarFacturas(ctx, proveedor.negocioId, {
    proveedorId: id,
  });
  const vigentes = facturas.filter((f) => f.estado === "REGISTRADA");
  const comprado = vigentes.reduce((a, f) => a + f.total, 0);
  const debe = vigentes.reduce((a, f) => a + f.total - f.pagado, 0);

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo={proveedor.nombre}
        subtitulo={
          <span className="flex items-center gap-2">
            {proveedor.nit ? `NIT ${proveedor.nit}` : "Sin NIT"}
            {!proveedor.activo && <Badge variant="secondary">Inactivo</Badge>}
          </span>
        }
        volver={{ href: "/proveedores/directorio", texto: "Proveedores" }}
        acciones={
          <>
            <Button asChild variant="outline">
              <Link href={`/proveedores/directorio/${id}/editar`}>
                <Pencil /> Editar
              </Link>
            </Button>
            <BotonActivoProveedor id={id} activo={proveedor.activo} />
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border p-5">
          <p className="text-sm text-muted-foreground">Le debes</p>
          <p className={cn("text-3xl font-bold tabular-nums", debe > 0 && "text-destructive")}>{formatearPesos(debe)}</p>
        </div>
        <div className="rounded-2xl border p-5">
          <p className="text-sm text-muted-foreground">
            Comprado
            {total > facturas.length ? ` (últimas ${facturas.length} facturas)` : ""}
          </p>
          <p className="text-3xl font-bold tabular-nums">{formatearPesos(comprado)}</p>
        </div>
      </div>

      {(proveedor.contacto || proveedor.telefono || proveedor.correo || proveedor.notas) && (
        <div className="space-y-2 rounded-2xl border p-5 text-sm">
          {proveedor.contacto && (
            <p className="flex items-center gap-2">
              <User className="size-4 text-muted-foreground" /> {proveedor.contacto}
            </p>
          )}
          {proveedor.telefono && (
            <p className="flex items-center gap-2">
              <Phone className="size-4 text-muted-foreground" />
              <a href={`tel:${proveedor.telefono}`} className="underline-offset-4 hover:underline">
                {proveedor.telefono}
              </a>
            </p>
          )}
          {proveedor.correo && (
            <p className="flex items-center gap-2">
              <Mail className="size-4 text-muted-foreground" /> {proveedor.correo}
            </p>
          )}
          {proveedor.notas && <p className="whitespace-pre-line text-muted-foreground">{proveedor.notas}</p>}
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Facturas</h2>
          {proveedor.activo && (
            <Button asChild size="sm">
              <Link href={`/proveedores/facturas/nueva?proveedor=${id}`}>
                <Plus /> Registrar factura
              </Link>
            </Button>
          )}
        </div>
        {facturas.length === 0 ? (
          <EstadoVacio
            icono={FileText}
            titulo="Sin facturas todavía"
            descripcion="Las compras a este proveedor aparecerán aquí."
          />
        ) : (
          <ul className="divide-y rounded-xl border">
            {facturas.map((f) => (
              <li key={f.id}>
                <Link href={`/proveedores/facturas/${f.id}`} className="flex items-center gap-3 p-4 hover:bg-muted/40">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="flex items-center gap-2 font-medium">
                      Factura {f.numero} <EstadoFactura estado={f.estado} estadoPago={f.estadoPago} />
                    </p>
                    <p className="text-sm text-muted-foreground">{formatearDia(f.fecha)}</p>
                  </div>
                  <p className={cn("font-semibold tabular-nums", f.estado === "ANULADA" && "text-muted-foreground line-through")}>
                    {formatearPesos(f.total)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
