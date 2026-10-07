import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { obtenerEmpresa } from "@/lib/datos/empresa";
import { obtenerDatosNegocio } from "@/lib/datos/negocios";
import { obtenerVenta } from "@/lib/datos/ventas";
import { formatearFecha, formatearHora, formatearPesos } from "@/lib/formato";
import { formatearCantidad } from "@/lib/inventario/cantidades";
import { UNIDADES } from "@/lib/inventario/unidades";
import { exigirModulo } from "@/lib/modulos";
import { obtenerContexto } from "@/lib/sesion";
import { formatearConsecutivo, NOMBRE_MEDIO } from "@/lib/ventas/recibo";
import type { UnidadMedida } from "@/generated/prisma/enums";
import { BarraRecibo } from "./imprimir";

export const metadata: Metadata = { title: "Recibo · Control Total" };

// Recibo para impresora térmica de 80 mm (unos 72 mm imprimibles). También sirve para guardar en PDF.
export default function PaginaRecibo(props: PageProps<"/recibo/[id]">) {
  return (
    <main className="min-h-dvh bg-muted/40 px-2 py-6 print:bg-white print:p-0">
      <style>{`@page { size: 80mm auto; margin: 0; } @media print { html, body { background: #fff !important; } }`}</style>
      <Suspense fallback={<div className="mx-auto h-96 max-w-[80mm] animate-pulse rounded bg-muted" />}>
        <Recibo {...props} />
      </Suspense>
    </main>
  );
}

async function Recibo({ params, searchParams }: PageProps<"/recibo/[id]">) {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "VENTAS");
  const { id } = await params;
  const sp = await searchParams;
  const venta = await obtenerVenta(ctx, id);
  if (!venta) notFound();
  const [negocio, empresa] = await Promise.all([obtenerDatosNegocio(ctx, venta.negocioId), obtenerEmpresa(ctx)]);

  // IVA agrupado por tarifa, como lo pide un recibo con impuestos discriminados.
  const porTarifa = new Map<number, { base: number; iva: number }>();
  for (const d of venta.detalles) {
    const t = porTarifa.get(d.porcentajeIva) ?? { base: 0, iva: 0 };
    porTarifa.set(d.porcentajeIva, { base: t.base + d.base, iva: t.iva + d.iva });
  }
  const anulada = venta.estado === "ANULADA";

  return (
    <>
      <BarraRecibo imprimir={sp.imprimir === "1"} volver={`/ventas/${venta.id}`} />
      <article className="relative mx-auto w-full max-w-[80mm] bg-white px-[4mm] py-[5mm] font-sans text-[12px] leading-snug text-black shadow-sm print:max-w-none print:shadow-none">
        <header className="space-y-0.5 text-center">
          {empresa?.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={empresa.logoUrl} alt="" className="mx-auto mb-1 max-h-16 max-w-[50mm] object-contain" />
          )}
          <p className="text-[15px] font-bold">{negocio?.nombre}</p>
          {negocio?.razonSocial && <p>{negocio.razonSocial}</p>}
          {(negocio?.nit || negocio?.regimen) && (
            <p>{[negocio.nit && `NIT ${negocio.nit}`, negocio.regimen].filter(Boolean).join(" · ")}</p>
          )}
          {negocio?.direccion && <p>{negocio.direccion}</p>}
          {negocio?.telefono && <p>Tel. {negocio.telefono}</p>}
        </header>

        <Separador />
        <div className="space-y-0.5">
          <p className="font-bold">Recibo de venta Nº {formatearConsecutivo(venta.consecutivo)}</p>
          <p>
            {formatearFecha(venta.creadoEn)} {formatearHora(venta.creadoEn)} · Atendió: {venta.cajero}
          </p>
          {venta.cliente && (
            <p>
              Cliente: {venta.cliente.nombre}
              {venta.cliente.numeroDocumento && ` · ${venta.cliente.tipoDocumento} ${venta.cliente.numeroDocumento}`}
            </p>
          )}
        </div>

        {anulada && (
          <div className="my-2 border-2 border-black py-1 text-center">
            <p className="text-[16px] font-bold tracking-widest">ANULADA</p>
            <p>{venta.motivoAnulacion}</p>
          </div>
        )}

        <Separador />
        <ul className="space-y-1.5">
          {venta.detalles.map((d) => (
            <li key={d.id}>
              <p className="font-medium">{d.nombre}</p>
              <div className="flex justify-between gap-2 tabular-nums">
                <span>
                  {formatearCantidad(d.cantidad)} {UNIDADES[d.unidad as UnidadMedida]?.corto} × {formatearPesos(d.precioUnitario)}
                  {d.porcentajeIva ? "" : " (sin IVA)"}
                </span>
                <span>{formatearPesos(d.subtotal)}</span>
              </div>
              {d.descuento > 0 && (
                <div className="flex justify-between tabular-nums">
                  <span>Descuento</span>
                  <span>{formatearPesos(-d.descuento)}</span>
                </div>
              )}
            </li>
          ))}
        </ul>

        <Separador />
        <Fila nombre="Subtotal" valor={venta.subtotal} />
        {venta.descuento > 0 && <Fila nombre="Descuentos" valor={-venta.descuento} />}
        <div className="mt-1 flex justify-between text-[16px] font-bold tabular-nums">
          <span>TOTAL</span>
          <span>{formatearPesos(venta.total)}</span>
        </div>

        <Separador />
        <table className="w-full tabular-nums">
          <thead>
            <tr className="text-left">
              <th className="font-medium">IVA</th>
              <th className="text-right font-medium">Base</th>
              <th className="text-right font-medium">Impuesto</th>
            </tr>
          </thead>
          <tbody>
            {[...porTarifa].sort(([a], [b]) => b - a).map(([tarifa, t]) => (
              <tr key={tarifa}>
                <td>{tarifa} %</td>
                <td className="text-right">{formatearPesos(t.base)}</td>
                <td className="text-right">{formatearPesos(t.iva)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <Separador />
        {venta.pagos.map((p) => (
          <Fila key={p.medio} nombre={`${NOMBRE_MEDIO[p.medio]}${p.referencia ? ` (${p.referencia})` : ""}`} valor={p.valor} />
        ))}
        {venta.recibido !== null && venta.recibido !== venta.pagos.find((p) => p.medio === "EFECTIVO")?.valor && (
          <Fila nombre="Recibido en efectivo" valor={venta.recibido} />
        )}
        {!!venta.cambio && <Fila nombre="Cambio" valor={venta.cambio} />}

        {venta.devoluciones.length > 0 && (
          <>
            <Separador />
            {venta.devoluciones.map((d) => (
              <Fila key={d.id} nombre={`Devolución Nº ${formatearConsecutivo(d.consecutivo)} (${formatearFecha(d.creadoEn)})`} valor={-d.total} />
            ))}
          </>
        )}

        <Separador />
        <footer className="space-y-1 text-center">
          {negocio?.mensajeRecibo && <p className="font-medium">{negocio.mensajeRecibo}</p>}
          <p className="text-[10px]">Este recibo no es una factura electrónica.</p>
          <p className="text-[10px]">Desarrollado por EMY TELECOM</p>
        </footer>
      </article>
    </>
  );
}

function Separador() {
  return <hr className="my-2 border-t border-dashed border-black" />;
}

function Fila({ nombre, valor }: { nombre: string; valor: number }) {
  return (
    <div className="flex justify-between gap-2 tabular-nums">
      <span>{nombre}</span>
      <span>{formatearPesos(valor)}</span>
    </div>
  );
}
