import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle, Printer } from "lucide-react";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { Button } from "@/components/ui/button";
import { obtenerDatosNegocio } from "@/lib/datos/negocios";
import { obtenerVenta } from "@/lib/datos/ventas";
import { formatearFecha, formatearHora, formatearPesos } from "@/lib/formato";
import { formatearCantidad } from "@/lib/inventario/cantidades";
import { UNIDADES } from "@/lib/inventario/unidades";
import { exigirModulo } from "@/lib/modulos";
import { obtenerContexto } from "@/lib/sesion";
import { enlaceWhatsApp, formatearConsecutivo, NOMBRE_MEDIO, textoWhatsApp } from "@/lib/ventas/recibo";
import type { UnidadMedida } from "@/generated/prisma/enums";
import { EstadoVenta } from "../estado-venta";
import { Correcciones } from "./correcciones";

export const metadata: Metadata = { title: "Venta · Control Total" };

export default async function DetalleVenta({ params }: PageProps<"/ventas/[id]">) {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "VENTAS");
  const { id } = await params;
  const venta = await obtenerVenta(ctx, id);
  if (!venta) notFound();
  const negocio = await obtenerDatosNegocio(ctx, venta.negocioId);
  const whatsapp = enlaceWhatsApp(textoWhatsApp(venta, negocio?.nombre ?? "", negocio?.mensajeRecibo), venta.cliente?.telefono);
  const verCosto = venta.detalles.some((d) => d.costoUnitario !== null);
  const anulada = venta.estado === "ANULADA";

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo={`Venta Nº ${formatearConsecutivo(venta.consecutivo)}`}
        volver={{ href: "/ventas/historial", texto: "Historial" }}
        subtitulo={
          <span className="flex flex-wrap items-center gap-2">
            {formatearFecha(venta.creadoEn)} {formatearHora(venta.creadoEn)} · {venta.cajero}
            {venta.cliente && ` · ${venta.cliente.nombre}`}
            <EstadoVenta estado={venta.estado} />
          </span>
        }
        acciones={
          <>
            <Button asChild variant="outline">
              <Link href={`/recibo/${venta.id}`}>
                <Printer /> Recibo
              </Link>
            </Button>
            <Button asChild variant="outline">
              <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                <MessageCircle /> WhatsApp
              </a>
            </Button>
          </>
        }
      />

      {anulada && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <p className="font-semibold text-destructive">Venta anulada</p>
          <p className="text-sm">
            {venta.anuladaPor} · {venta.anuladaEn && `${formatearFecha(venta.anuladaEn)} ${formatearHora(venta.anuladaEn)}`}
          </p>
          <p className="text-sm text-muted-foreground">Motivo: {venta.motivoAnulacion}</p>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-muted/60 text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Producto</th>
              <th className="px-4 py-3 text-right font-medium">Cantidad</th>
              <th className="px-4 py-3 text-right font-medium">Precio</th>
              {verCosto && <th className="px-4 py-3 text-right font-medium">Costo</th>}
              <th className="px-4 py-3 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {venta.detalles.map((d) => (
              <tr key={d.id}>
                <td className="px-4 py-3">
                  <p className="font-medium">{d.nombre}</p>
                  <p className="text-muted-foreground">
                    {d.codigo} · IVA {d.porcentajeIva} %
                    {d.descuento > 0 && <span className="text-emerald-700 dark:text-emerald-400"> · Descuento − {formatearPesos(d.descuento)}</span>}
                  </p>
                  {Number(d.cantidadDevuelta) > 0 && (
                    <p className="text-amber-700 dark:text-amber-400">
                      Devuelto: {formatearCantidad(d.cantidadDevuelta)} {UNIDADES[d.unidad as UnidadMedida]?.corto}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatearCantidad(d.cantidad)} {UNIDADES[d.unidad as UnidadMedida]?.corto}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{formatearPesos(d.precioUnitario)}</td>
                {verCosto && (
                  <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">{formatearPesos(d.costoUnitario ?? 0)}</td>
                )}
                <td className="px-4 py-3 text-right font-medium tabular-nums">{formatearPesos(d.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <dl className="space-y-1.5 rounded-xl border p-4 text-sm">
          <Fila nombre="Subtotal" valor={formatearPesos(venta.subtotal)} />
          {venta.descuento > 0 && <Fila nombre="Descuentos" valor={`− ${formatearPesos(venta.descuento)}`} />}
          <Fila nombre="Base" valor={formatearPesos(venta.base)} />
          <Fila nombre="IVA" valor={formatearPesos(venta.iva)} />
          <div className="flex justify-between border-t pt-2 text-lg font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatearPesos(venta.total)}</dd>
          </div>
        </dl>
        <dl className="space-y-1.5 rounded-xl border p-4 text-sm">
          {venta.pagos.map((p) => (
            <Fila key={p.medio} nombre={`${NOMBRE_MEDIO[p.medio]}${p.referencia ? ` (${p.referencia})` : ""}`} valor={formatearPesos(p.valor)} />
          ))}
          {venta.recibido !== null && <Fila nombre="Recibido en efectivo" valor={formatearPesos(venta.recibido)} />}
          {venta.cambio !== null && <Fila nombre="Cambio" valor={formatearPesos(venta.cambio)} />}
          {venta.devoluciones.map((d) => (
            <div key={d.id} className="border-t pt-2">
              <Fila
                nombre={`Devolución Nº ${formatearConsecutivo(d.consecutivo)} · ${NOMBRE_MEDIO[d.medio]}`}
                valor={`− ${formatearPesos(d.total)}`}
              />
              <p className="text-muted-foreground">
                {formatearFecha(d.creadoEn)} · {d.motivo}
              </p>
            </div>
          ))}
        </dl>
      </div>

      {!anulada &&
        (venta.puedeCorregir ? (
          <Correcciones
            ventaId={venta.id}
            conDevolucion={venta.estado === "CON_DEVOLUCION"}
            lineas={venta.detalles.map((d) => ({
              id: d.id,
              nombre: d.nombre,
              unidad: d.unidad,
              cantidad: d.cantidad,
              cantidadDevuelta: d.cantidadDevuelta,
              total: d.total,
            }))}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Esta venta es de otro día. Si hay que anularla o registrar una devolución, pídeselo al administrador.
          </p>
        ))}
    </div>
  );
}

function Fila({ nombre, valor }: { nombre: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{nombre}</dt>
      <dd className="text-right tabular-nums">{valor}</dd>
    </div>
  );
}
