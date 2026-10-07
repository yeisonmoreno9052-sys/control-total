import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { obtenerFactura } from "@/lib/datos/compras";
import { formatearDia, formatearFecha, formatearHora, formatearPesos } from "@/lib/formato";
import { formatearCantidad } from "@/lib/inventario/cantidades";
import { UNIDADES } from "@/lib/inventario/unidades";
import { exigirModulo } from "@/lib/modulos";
import { puedeGestionar } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { NOMBRE_MEDIO } from "@/lib/ventas/recibo";
import { cn } from "@/lib/utils";
import type { UnidadMedida } from "@/generated/prisma/enums";
import { EstadoFactura } from "../../comunes";
import { Adjuntos, AnularFactura, BotonAnularAbono, RegistrarPago } from "./acciones-factura";

export const metadata: Metadata = { title: "Factura de compra · Control Total" };

export default async function Factura({ params, searchParams }: PageProps<"/proveedores/facturas/[id]">) {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "PROVEEDORES");
  if (!puedeGestionar(ctx)) return <SinPermiso />;
  const { id } = await params;
  const f = await obtenerFactura(ctx, id);
  if (!f) notFound();
  const nueva = (await searchParams).nueva === "1";
  const vigente = f.estado === "REGISTRADA";
  const abonosVigentes = f.abonos.filter((a) => !a.anulado).length;

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo={`Factura ${f.numero}`}
        subtitulo={
          <span className="flex flex-wrap items-center gap-2">
            {f.proveedor && (
              <Link href={`/proveedores/directorio/${f.proveedor.id}`} className="underline-offset-4 hover:underline">
                {f.proveedor.nombre}
              </Link>
            )}
            · {formatearDia(f.fecha)} <EstadoFactura estado={f.estado} estadoPago={f.estadoPago} />
          </span>
        }
        volver={{ href: "/proveedores", texto: "Facturas" }}
      />

      {nueva && (
        <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
          <CheckCircle2 className="size-5 shrink-0" /> Factura guardada. El stock y los costos ya se actualizaron.
          {f.adjuntos.length === 0 && " Si quieres, adjunta la foto de la factura abajo."}
        </p>
      )}

      {!vigente && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <p className="font-medium text-destructive">Factura anulada</p>
          <p>
            {f.anuladaPor} · {f.anuladaEn && `${formatearFecha(f.anuladaEn)} ${formatearHora(f.anuladaEn)}`} · {f.motivoAnulacion}
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border p-5">
          <p className="text-sm text-muted-foreground">Total</p>
          <p className={cn("text-2xl font-bold tabular-nums", !vigente && "text-muted-foreground line-through")}>
            {formatearPesos(f.total)}
          </p>
        </div>
        <div className="rounded-2xl border p-5">
          <p className="text-sm text-muted-foreground">Pagado</p>
          <p className="text-2xl font-bold tabular-nums">{formatearPesos(f.pagado)}</p>
        </div>
        <div className="rounded-2xl border p-5">
          <p className="text-sm text-muted-foreground">
            Saldo{vigente && f.vencimiento && f.saldo > 0 && ` · vence ${formatearDia(f.vencimiento)}`}
          </p>
          <p className={cn("text-2xl font-bold tabular-nums", f.saldo > 0 && "text-destructive")}>{formatearPesos(f.saldo)}</p>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold">Productos</h2>
        <ul className="divide-y rounded-xl border">
          {f.detalles.map((d) => {
            const corto = UNIDADES[d.unidad as UnidadMedida]?.corto;
            return (
              <li key={d.id} className="flex items-start gap-3 p-4">
                <div className="min-w-0 flex-1 space-y-1">
                  <Link href={`/inventario/${d.productoId}`} className="font-medium underline-offset-4 hover:underline">
                    {d.nombre}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {formatearCantidad(d.cantidad)} {corto} × {formatearPesos(d.costoUnitario)}
                    {d.costoAntes !== d.costoDespues &&
                      ` · costo ${formatearPesos(d.costoAntes)} → ${formatearPesos(d.costoDespues)}`}
                    {d.precioAntes !== d.precioDespues &&
                      ` · precio ${formatearPesos(d.precioAntes)} → ${formatearPesos(d.precioDespues)}`}
                  </p>
                </div>
                <p className="font-semibold tabular-nums">{formatearPesos(d.total)}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Pagos</h2>
          {vigente && f.saldo > 0 && <RegistrarPago facturaId={f.id} saldo={f.saldo} />}
        </div>
        {f.abonos.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            Aún no hay pagos de esta factura.
          </p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {f.abonos.map((a) => (
              <li key={a.id} className={cn("flex items-center gap-3 p-4", a.anulado && "opacity-60")}>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-medium">
                    {NOMBRE_MEDIO[a.medio]}
                    {a.cajaId && " · salió de la caja"}
                    {a.anulado && <span className="ml-2 text-sm text-destructive">Anulado</span>}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatearFecha(a.creadoEn)} {formatearHora(a.creadoEn)} · {a.usuario}
                    {a.referencia && ` · ${a.referencia}`}
                    {a.nota && ` · ${a.nota}`}
                  </p>
                </div>
                <p className={cn("font-semibold tabular-nums", a.anulado && "line-through")}>{formatearPesos(a.valor)}</p>
                {!a.anulado && vigente && <BotonAnularAbono abonoId={a.id} valor={a.valor} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Adjuntos facturaId={f.id} adjuntos={f.adjuntos.map((a) => ({ id: a.id, nombre: a.nombre, tipo: a.tipo, tamano: a.tamano }))} />

      {f.nota && (
        <section className="space-y-1">
          <h2 className="font-semibold">Nota</h2>
          <p className="whitespace-pre-line text-muted-foreground">{f.nota}</p>
        </section>
      )}

      <p className="text-sm text-muted-foreground">
        Registrada por {f.registradaPor} el {formatearFecha(f.creadoEn)} a las {formatearHora(f.creadoEn)}
      </p>

      {vigente && <AnularFactura facturaId={f.id} conPagos={abonosVigentes > 0} />}
    </div>
  );
}
