import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { Button } from "@/components/ui/button";
import { cuentaDeCliente, negocioPermiteCredito } from "@/lib/datos/creditos";
import { formatearFecha, formatearHora, formatearPesos } from "@/lib/formato";
import { exigirModulo } from "@/lib/modulos";
import { puedeGestionar } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { enlaceWhatsApp, NOMBRE_MEDIO } from "@/lib/ventas/recibo";
import { cn } from "@/lib/utils";
import { AnularAbono, RegistrarAbono } from "./abono";

export const metadata: Metadata = { title: "Crédito · Control Total" };

export default async function CuentaCliente({ params }: PageProps<"/ventas/creditos/[id]">) {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "VENTAS");
  if (!ctx.negocioActivoId) notFound();
  const negocioId = ctx.negocioActivoId;
  if (!(await negocioPermiteCredito(ctx, negocioId))) notFound();
  const { id } = await params;
  const cuenta = await cuentaDeCliente(ctx, negocioId, id);
  if (!cuenta) notFound();
  const { cliente, debe, movimientos } = cuenta;
  const gestiona = puedeGestionar(ctx);
  const recordatorio =
    debe > 0
      ? enlaceWhatsApp(`Hola ${cliente.nombre}, te recordamos que tienes un saldo pendiente de ${formatearPesos(debe)}. ¡Gracias!`, cliente.telefono)
      : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <EncabezadoPagina
        titulo={cliente.nombre}
        volver={{ href: "/ventas/creditos", texto: "Volver a créditos" }}
        subtitulo={[cliente.telefono, cliente.numeroDocumento].filter(Boolean).join(" · ") || undefined}
      />

      <div className="grid gap-4 rounded-2xl border bg-card p-6 shadow-suave sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <p className="text-muted-foreground">{debe < 0 ? "Tiene a favor" : "Debe"}</p>
          <p
            className={cn("text-4xl font-bold tracking-tight tabular-nums", debe < 0 && "text-emerald-700 dark:text-emerald-400")}
            data-testid="debe"
          >
            {formatearPesos(Math.abs(debe))}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:w-56">
          {debe > 0 && <RegistrarAbono clienteId={cliente.id} debe={debe} />}
          {recordatorio && (
            <Button asChild variant="outline" size="lg">
              <a href={recordatorio} target="_blank" rel="noopener noreferrer">
                <MessageCircle /> Recordar por WhatsApp
              </a>
            </Button>
          )}
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Movimientos</h2>
        {movimientos.length === 0 ? (
          <p className="text-muted-foreground">Todavía no tiene movimientos.</p>
        ) : (
          <ul className="divide-y rounded-2xl border bg-card shadow-suave">
            {movimientos.map((m) => (
              <li key={`${m.tipo}-${m.id}`} className={cn("flex items-center gap-3 px-4 py-3", m.anulado && "opacity-60")}>
                <div className="min-w-0 flex-1">
                  <p className={cn("font-medium", m.anulado && "line-through")}>
                    {m.ventaId ? (
                      <Link href={`/ventas/${m.ventaId}`} className="underline-offset-4 hover:underline">
                        {m.texto}
                      </Link>
                    ) : (
                      m.texto
                    )}
                    {m.anulado && <span className="ml-2 text-sm font-normal no-underline">(anulado)</span>}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatearFecha(m.fecha)} {formatearHora(m.fecha)}
                    {m.medio && ` · ${NOMBRE_MEDIO[m.medio]}`}
                  </p>
                </div>
                <p
                  className={cn(
                    "text-lg font-semibold tabular-nums",
                    m.valor < 0 ? "text-emerald-700 dark:text-emerald-400" : "text-foreground",
                  )}
                >
                  {m.valor < 0 ? "−" : "+"}
                  {formatearPesos(Math.abs(m.valor))}
                </p>
                {gestiona && m.tipo === "abono" && m.anulable && <AnularAbono abonoId={m.id} valor={-m.valor} />}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-sm text-muted-foreground">
          Lo que se fía suma (+). Los abonos y devoluciones restan (−).
        </p>
      </section>
    </div>
  );
}
