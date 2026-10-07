import type { Metadata } from "next";
import Link from "next/link";
import { Plus, SearchX, Truck } from "lucide-react";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { EstadoVacio } from "@/components/layout/estado-vacio";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listarProveedores } from "@/lib/datos/compras";
import { formatearPesos } from "@/lib/formato";
import { exigirModulo } from "@/lib/modulos";
import { puedeGestionar } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { Pestanas } from "../comunes";

export const metadata: Metadata = { title: "Proveedores · Control Total" };

export default async function Directorio({ searchParams }: PageProps<"/proveedores/directorio">) {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "PROVEEDORES");
  if (!puedeGestionar(ctx) || !ctx.negocioActivoId) return <SinPermiso />;
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 60) : "";
  const proveedores = await listarProveedores(ctx, ctx.negocioActivoId, {
    q,
    inactivos: true,
  });

  return (
    <div>
      <EncabezadoPagina
        titulo="Proveedores y compras"
        acciones={
          <Button asChild size="lg" variant="outline">
            <Link href="/proveedores/directorio/nuevo">
              <Plus /> Nuevo proveedor
            </Link>
          </Button>
        }
      />
      <Pestanas activa="/proveedores/directorio" />

      {proveedores.length === 0 && !q ? (
        <EstadoVacio
          icono={Truck}
          titulo="Aún no hay proveedores"
          descripcion="Agrega a quienes te venden la mercancía. También puedes crearlos mientras registras una factura."
          accion={
            <Button asChild>
              <Link href="/proveedores/directorio/nuevo">Agregar proveedor</Link>
            </Button>
          }
        />
      ) : (
        <>
          <form className="mb-4 flex gap-2">
            <Input name="q" defaultValue={q} placeholder="Buscar por nombre o NIT" />
            <Button type="submit" variant="outline" className="h-11">
              Buscar
            </Button>
          </form>
          {proveedores.length === 0 ? (
            <EstadoVacio
              icono={SearchX}
              titulo="No encontramos ese proveedor"
              descripcion="Revisa cómo lo escribiste o créalo."
              accion={
                <Button asChild variant="outline">
                  <Link href="/proveedores/directorio/nuevo">Nuevo proveedor</Link>
                </Button>
              }
            />
          ) : (
            <ul className="divide-y rounded-xl border">
              {proveedores.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/proveedores/directorio/${p.id}`}
                    className="flex items-center gap-3 p-4 hover:bg-muted/40 active:bg-muted"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="flex items-center gap-2 font-medium">
                        <span className="truncate">{p.nombre}</span>
                        {!p.activo && <Badge variant="secondary">Inactivo</Badge>}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {[p.nit && `NIT ${p.nit}`, p.contacto, p.telefono].filter(Boolean).join(" · ") || "Sin datos de contacto"}
                      </p>
                    </div>
                    {p.deuda > 0 && (
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Le debes</p>
                        <p className="font-semibold tabular-nums">{formatearPesos(p.deuda)}</p>
                      </div>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
