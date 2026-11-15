import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { saldoDeCliente } from "@/lib/datos/creditos";
import { obtenerEmpresa } from "@/lib/datos/empresa";
import { obtenerDatosNegocio } from "@/lib/datos/negocios";
import { obtenerVenta } from "@/lib/datos/ventas";
import { formatearFecha, formatearHora, formatearPesos } from "@/lib/formato";
import { exigirModulo } from "@/lib/modulos";
import { obtenerContexto } from "@/lib/sesion";
import { formatearConsecutivo, NOMBRE_MEDIO, textoCantidad } from "@/lib/ventas/recibo";
import { LogoEtiqueta } from "@/components/etiquetas/logo-etiqueta";
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
  // "(sin IVA)" solo aclara algo cuando la venta mezcla productos con y sin IVA.
  const conIva = venta.detalles.some((d) => d.porcentajeIva > 0);
  const anulada = venta.estado === "ANULADA";
  const fiada = venta.pagos.some((p) => p.medio === "CREDITO");
  const debe = fiada && venta.clienteId ? await saldoDeCliente(ctx, venta.negocioId, venta.clienteId) : null;

  // En negocios sin IVA el cuadro de impuestos solo diría "0 %": se omite.
  const hayIva = venta.detalles.some((d) => d.iva > 0);

  return (
    <>
      <BarraRecibo imprimir={sp.imprimir === "1"} volver={`/ventas/${venta.id}`} />
      {/* Todo en negro puro y con trazo firme: la impresora térmica no tiene grises y la letra delgada sale pálida. */}
      <article className="relative mx-auto w-full max-w-[80mm] bg-white px-[4mm] py-[5mm] font-sans text-[12.5px] leading-snug font-medium text-black shadow-sm print:max-w-none print:shadow-none">
        <header className="flex flex-col items-center gap-0.5 text-center">
          {empresa?.logoUrl && <LogoEtiqueta url={empresa.logoUrl} lado={400} className="mb-1.5 size-[22mm]" />}
          <p className="text-[18px] font-extrabold tracking-wide uppercase">{negocio?.nombre}</p>
          {negocio?.razonSocial && <p className="font-semibold">{negocio.razonSocial}</p>}
          {(negocio?.nit || negocio?.regimen) && (
            <p>{[negocio.nit && `NIT ${negocio.nit}`, negocio.regimen].filter(Boolean).join(" · ")}</p>
          )}
          {negocio?.direccion && <p>{negocio.direccion}</p>}
          {negocio?.telefono && <p>Tel. {negocio.telefono}</p>}
        </header>

        <Linea gruesa />
        <div className="text-center">
          <p className="text-[11px] font-bold tracking-[0.2em] uppercase">Recibo de venta</p>
          <p className="text-[17px] font-extrabold tabular-nums">Nº {formatearConsecutivo(venta.consecutivo)}</p>
        </div>
        <div className="mt-1.5 space-y-0.5">
          <Dato nombre="Fecha" valor={`${formatearFecha(venta.creadoEn)} · ${formatearHora(venta.creadoEn)}`} />
          <Dato nombre="Atendió" valor={venta.cajero} />
          {venta.cliente && <Dato nombre="Cliente" valor={venta.cliente.nombre} />}
          {venta.cliente?.numeroDocumento && (
            <Dato nombre="Documento" valor={`${venta.cliente.tipoDocumento} ${venta.cliente.numeroDocumento}`} />
          )}
        </div>

        {anulada && (
          <div className="mt-2 border-2 border-black py-1 text-center">
            <p className="text-[16px] font-extrabold tracking-widest">ANULADA</p>
            <p>{venta.motivoAnulacion}</p>
          </div>
        )}

        <Linea gruesa />
        <div className="flex justify-between text-[11px] font-bold tracking-wider uppercase">
          <span>Descripción</span>
          <span>Valor</span>
        </div>
        <Linea />
        <ul className="space-y-2">
          {venta.detalles.map((d) => (
            <li key={d.id}>
              <p className="font-bold">{d.nombre}</p>
              <div className="flex justify-between gap-2 tabular-nums">
                <span>
                  {textoCantidad(d)} × {formatearPesos(d.precioUnitario)}
                  {conIva && !d.porcentajeIva ? " (sin IVA)" : ""}
                </span>
                <span className="font-bold">{formatearPesos(d.subtotal)}</span>
              </div>
              {d.descuento > 0 && (
                <div className="flex justify-between tabular-nums">
                  <span>Descuento</span>
                  <span className="font-bold">{formatearPesos(-d.descuento)}</span>
                </div>
              )}
            </li>
          ))}
        </ul>

        <Linea />
        <div className="space-y-0.5">
          <Fila nombre="Subtotal" valor={venta.subtotal} />
          {venta.descuento > 0 && <Fila nombre="Descuentos" valor={-venta.descuento} />}
          {hayIva && <Fila nombre="IVA" valor={venta.iva} />}
        </div>
        <div className="mt-1.5 flex items-baseline justify-between border-y-2 border-black py-1.5 tabular-nums">
          <span className="text-[15px] font-extrabold tracking-wider">TOTAL</span>
          <span className="text-[20px] font-extrabold">{formatearPesos(venta.total)}</span>
        </div>

        {hayIva && (
          <>
            <table className="mt-2 w-full text-[11px] tabular-nums">
              <thead>
                <tr className="text-left">
                  <th className="font-bold">IVA</th>
                  <th className="text-right font-bold">Base</th>
                  <th className="text-right font-bold">Impuesto</th>
                </tr>
              </thead>
              <tbody>
                {[...porTarifa]
                  .sort(([a], [b]) => b - a)
                  .map(([tarifa, t]) => (
                    <tr key={tarifa}>
                      <td>{tarifa} %</td>
                      <td className="text-right">{formatearPesos(t.base)}</td>
                      <td className="text-right">{formatearPesos(t.iva)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </>
        )}

        <p className="mt-3 text-[11px] font-bold tracking-wider uppercase">Forma de pago</p>
        <div className="mt-0.5 space-y-0.5">
          {venta.pagos.map((p) => (
            <Fila key={p.medio} nombre={`${NOMBRE_MEDIO[p.medio]}${p.referencia ? ` (${p.referencia})` : ""}`} valor={p.valor} />
          ))}
          {venta.recibido !== null && venta.recibido !== venta.pagos.find((p) => p.medio === "EFECTIVO")?.valor && (
            <Fila nombre="Recibido en efectivo" valor={venta.recibido} />
          )}
          {!!venta.cambio && <Fila nombre="Cambio" valor={venta.cambio} />}
          {debe !== null && debe > 0 && (
            <div className="flex justify-between font-extrabold tabular-nums">
              <span>Saldo pendiente hoy</span>
              <span>{formatearPesos(debe)}</span>
            </div>
          )}
        </div>

        {venta.devoluciones.length > 0 && (
          <>
            <Linea />
            {venta.devoluciones.map((d) => (
              <Fila
                key={d.id}
                nombre={`Devolución Nº ${formatearConsecutivo(d.consecutivo)} (${formatearFecha(d.creadoEn)})`}
                valor={-d.total}
              />
            ))}
          </>
        )}

        <Linea gruesa />
        <footer className="space-y-1 text-center">
          <p className="text-[14px] font-extrabold">{negocio?.mensajeRecibo || "¡Gracias por su compra!"}</p>
          <p className="pt-1 text-[10px]">Este recibo no es una factura electrónica.</p>
          <p className="text-[10px]">Desarrollado por EMY TELECOM</p>
        </footer>
      </article>
    </>
  );
}

function Linea({ gruesa }: { gruesa?: boolean }) {
  return gruesa ? <hr className="my-2.5 border-t-2 border-black" /> : <hr className="my-2 border-t border-dashed border-black" />;
}

function Dato({ nombre, valor }: { nombre: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span>{nombre}</span>
      <span className="text-right font-bold">{valor}</span>
    </div>
  );
}

function Fila({ nombre, valor }: { nombre: string; valor: number }) {
  return (
    <div className="flex justify-between gap-2 tabular-nums">
      <span>{nombre}</span>
      <span className="font-bold">{formatearPesos(valor)}</span>
    </div>
  );
}
