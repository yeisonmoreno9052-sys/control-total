import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { detalleDeCierre } from "@/lib/datos/caja";
import { formatearDia, formatearFecha, formatearHora, formatearPesos } from "@/lib/formato";
import { exigirModulo } from "@/lib/modulos";
import { obtenerContexto } from "@/lib/sesion";
import { BarraRecibo } from "../../recibo/[id]/imprimir";

export const metadata: Metadata = { title: "Cierre de caja · Control Total" };

// Detalle del cierre para la impresora de recibos (80 mm) o para guardar en PDF.
export default function PaginaCierre(props: PageProps<"/cierre/[id]">) {
  return (
    <main className="min-h-dvh bg-muted/40 px-2 py-6 print:bg-white print:p-0">
      <style>{`@page { size: 80mm auto; margin: 0; } @media print { html, body { background: #fff !important; } }`}</style>
      <Suspense fallback={<div className="mx-auto h-96 max-w-[80mm] animate-pulse rounded bg-muted" />}>
        <Cierre {...props} />
      </Suspense>
    </main>
  );
}

async function Cierre({ params, searchParams }: PageProps<"/cierre/[id]">) {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "VENTAS");
  const { id } = await params;
  const sp = await searchParams;
  const c = await detalleDeCierre(ctx, id);
  if (!c) notFound();
  const r = c.resumen;
  const cerrada = c.estado === "CERRADA";
  const esperado = cerrada && c.esperado !== null ? c.esperado : r.esperado;

  return (
    <>
      <BarraRecibo imprimir={sp.imprimir === "1"} volver="/ventas/caja" />
      <article className="mx-auto w-full max-w-[80mm] bg-white px-[4mm] py-[5mm] font-sans text-[12px] leading-snug text-black shadow-sm print:max-w-none print:shadow-none">
        <header className="space-y-0.5 text-center">
          <p className="text-[15px] font-bold">{c.negocio}</p>
          <p className="font-bold">Cierre de caja</p>
          <p>{formatearDia(c.fecha)}</p>
        </header>

        <Separador />
        <p>
          Abrió: {c.abiertaPor ?? "—"} · {formatearHora(c.abiertaEn)}
        </p>
        {cerrada && c.cerradaEn ? (
          <p>
            Cerró: {c.cerradaPor ?? "—"} · {formatearFecha(c.cerradaEn)} {formatearHora(c.cerradaEn)}
          </p>
        ) : (
          <p className="font-bold">Caja todavía abierta</p>
        )}

        <Separador />
        <Fila nombre="Base" valor={r.base} />
        <Fila nombre="Ventas en efectivo" valor={r.ventasEfectivo} />
        {!!r.anulacionesEfectivo && <Fila nombre="Anulaciones" valor={-r.anulacionesEfectivo} />}
        {!!r.devolucionesEfectivo && <Fila nombre="Devoluciones" valor={-r.devolucionesEfectivo} />}
        {!!r.pagosProveedores && <Fila nombre="Pagos a proveedores" valor={-r.pagosProveedores} />}
        {!!r.ingresosEfectivo && <Fila nombre="Otros ingresos" valor={r.ingresosEfectivo} />}
        {!!r.egresosEfectivo && <Fila nombre="Egresos" valor={-r.egresosEfectivo} />}
        <div className="mt-1 flex justify-between font-bold tabular-nums">
          <span>Efectivo esperado</span>
          <span>{formatearPesos(esperado)}</span>
        </div>
        {cerrada && c.contado !== null && (
          <>
            <Fila nombre="Efectivo contado" valor={c.contado} />
            <div className="mt-1 flex justify-between text-[15px] font-bold tabular-nums">
              <span>{!c.diferencia ? "Cuadra" : c.diferencia < 0 ? "Faltó" : "Sobró"}</span>
              <span>{formatearPesos(Math.abs(c.diferencia ?? 0))}</span>
            </div>
          </>
        )}

        <Separador />
        <Fila nombre={`Ventas (${r.ventas})`} valor={r.ventasEfectivo + r.ventasTransferencia} />
        <Fila nombre="En transferencia" valor={r.ventasTransferencia} />
        <p className="text-[11px]">Las transferencias no están en la caja.</p>

        {cerrada && esperado !== r.esperado && (
          <>
            <Separador />
            <p className="text-[11px]">
              Después del cierre cambió algo de esta caja (por ejemplo, una anulación). Hoy el esperado sería{" "}
              {formatearPesos(r.esperado)}.
            </p>
          </>
        )}
        {c.nota && (
          <>
            <Separador />
            <p>Nota: {c.nota}</p>
          </>
        )}
        <Separador />
        <p className="pt-1 text-center text-[10px]">Control Total · Desarrollado por EMY TELECOM</p>
      </article>
    </>
  );
}

function Separador() {
  return <div className="my-2 border-t border-dashed border-black" />;
}

function Fila({ nombre, valor }: { nombre: string; valor: number }) {
  return (
    <div className="flex justify-between gap-2 tabular-nums">
      <span>{nombre}</span>
      <span>{formatearPesos(valor)}</span>
    </div>
  );
}
