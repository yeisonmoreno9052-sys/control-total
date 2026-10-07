import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Plus, SearchX } from "lucide-react";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { EstadoVacio } from "@/components/layout/estado-vacio";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { listarFacturas, listarProveedores } from "@/lib/datos/compras";
import { formatearDia, formatearPesos } from "@/lib/formato";
import { exigirModulo } from "@/lib/modulos";
import { puedeGestionar } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { cn } from "@/lib/utils";
import { EstadoFactura, Pestanas } from "./comunes";

export const metadata: Metadata = {
  title: "Facturas de compra · Control Total",
};

type Parametros = {
  q?: string;
  proveedor?: string;
  estado?: string;
  pagina?: string;
};
const ESTADOS = {
  PENDIENTE: "Pendientes",
  ABONO_PARCIAL: "Con abonos",
  PAGADA: "Pagadas",
} as const;

function enlace(p: Parametros, cambios: Partial<Parametros>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...p, ...cambios })) if (v) q.set(k, v);
  return `/proveedores?${q}`;
}

export default async function Facturas({ searchParams }: PageProps<"/proveedores">) {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "PROVEEDORES");
  if (!puedeGestionar(ctx) || !ctx.negocioActivoId) return <SinPermiso />;
  const negocioId = ctx.negocioActivoId;
  const sp = await searchParams;
  const p: Parametros = {
    q: typeof sp.q === "string" ? sp.q.slice(0, 60) : undefined,
    proveedor: typeof sp.proveedor === "string" ? sp.proveedor : undefined,
    estado: typeof sp.estado === "string" && sp.estado in ESTADOS ? sp.estado : undefined,
    pagina: typeof sp.pagina === "string" ? sp.pagina : undefined,
  };
  const [resultado, proveedores] = await Promise.all([
    listarFacturas(ctx, negocioId, {
      q: p.q,
      proveedorId: p.proveedor,
      estadoPago: p.estado as keyof typeof ESTADOS | undefined,
      pagina: Number(p.pagina) || 1,
    }),
    listarProveedores(ctx, negocioId, { inactivos: true }),
  ]);
  const filtrando = !!(p.q || p.proveedor || p.estado);

  return (
    <div>
      <EncabezadoPagina
        titulo="Proveedores y compras"
        subtitulo={`${resultado.total.toLocaleString("es-CO")} ${resultado.total === 1 ? "factura" : "facturas"}`}
        acciones={
          <Button asChild size="lg">
            <Link href="/proveedores/facturas/nueva">
              <Plus /> Registrar factura
            </Link>
          </Button>
        }
      />
      <Pestanas activa="/proveedores" />

      {resultado.total === 0 && !filtrando ? (
        <EstadoVacio
          icono={FileText}
          titulo="Aún no hay facturas de compra"
          descripcion="Registra la primera factura de un proveedor: el stock sube y el costo se actualiza solo."
          accion={
            <Button asChild>
              <Link href="/proveedores/facturas/nueva">Registrar factura</Link>
            </Button>
          }
        />
      ) : (
        <>
          <form className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,12rem)_auto]">
            <Input name="q" defaultValue={p.q} placeholder="Número de factura" className="col-span-2 md:col-span-1" />
            <NativeSelect name="proveedor" defaultValue={p.proveedor ?? ""} aria-label="Proveedor">
              <option value="">Todos los proveedores</option>
              {proveedores.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nombre}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect name="estado" defaultValue={p.estado ?? ""} aria-label="Estado de pago">
              <option value="">Todas</option>
              {Object.entries(ESTADOS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </NativeSelect>
            <Button type="submit" variant="outline" className="col-span-2 h-11 md:col-span-1">
              Buscar
            </Button>
          </form>

          {resultado.facturas.length === 0 ? (
            <EstadoVacio
              icono={SearchX}
              titulo="No hay facturas con esos filtros"
              descripcion="Cambia la búsqueda o quita los filtros."
              accion={
                <Button asChild variant="outline">
                  <Link href="/proveedores">Ver todas</Link>
                </Button>
              }
            />
          ) : (
            <ul className="divide-y rounded-xl border">
              {resultado.facturas.map((f) => (
                <li key={f.id}>
                  <Link
                    href={`/proveedores/facturas/${f.id}`}
                    className="flex items-center gap-3 p-4 hover:bg-muted/40 active:bg-muted"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        <span className="truncate">{f.proveedor}</span>
                        <EstadoFactura estado={f.estado} estadoPago={f.estadoPago} />
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Factura {f.numero} · {formatearDia(f.fecha)}
                        {f.vencimiento &&
                          f.estado === "REGISTRADA" &&
                          f.estadoPago !== "PAGADA" &&
                          ` · vence ${formatearDia(f.vencimiento)}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={cn(
                          "font-semibold tabular-nums",
                          f.estado === "ANULADA" && "text-muted-foreground line-through",
                        )}
                      >
                        {formatearPesos(f.total)}
                      </p>
                      {f.estado === "REGISTRADA" && f.estadoPago !== "PAGADA" && (
                        <p className="text-sm text-muted-foreground tabular-nums">Debe {formatearPesos(f.total - f.pagado)}</p>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {resultado.paginas > 1 && (
            <nav className="mt-6 flex items-center justify-between gap-3" aria-label="Páginas">
              <Button asChild variant="outline" className={cn(resultado.pagina <= 1 && "pointer-events-none opacity-50")}>
                <Link href={enlace(p, { pagina: String(resultado.pagina - 1) })}>Anterior</Link>
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {resultado.pagina} de {resultado.paginas}
              </span>
              <Button
                asChild
                variant="outline"
                className={cn(resultado.pagina >= resultado.paginas && "pointer-events-none opacity-50")}
              >
                <Link href={enlace(p, { pagina: String(resultado.pagina + 1) })}>Siguiente</Link>
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
