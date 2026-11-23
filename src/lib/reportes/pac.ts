// Reporte del PAC (recargas y retiros) para Excel: resumen, por día y el detalle.
import type { Reporte } from "./armar";
import { NOMBRE_OPERACION_PAC, totalesPac, type OperacionPacVista } from "@/lib/datos/pac";
import { formatearFecha, formatearHora } from "@/lib/formato";

export function reportePac(operaciones: OperacionPacVista[], negocio: string, periodo: string): Omit<Reporte, "vista"> {
  const t = totalesPac(operaciones);
  const porDia = new Map<string, { dia: string; n: number; movido: number; comisiones: number }>();
  for (const o of operaciones) {
    if (o.anulado) continue;
    const dia = formatearFecha(o.fecha);
    const d = porDia.get(dia) ?? { dia, n: 0, movido: 0, comisiones: 0 };
    d.n++;
    d.movido += o.valor;
    d.comisiones += o.comision;
    porDia.set(dia, d);
  }
  return {
    titulo: "PAC: recargas y retiros",
    negocio,
    periodo,
    tarjetas: [
      { etiqueta: "Comisiones ganadas", valor: t.comisiones, tipo: "pesos", destacada: true },
      { etiqueta: "Plata movida", valor: t.movido, tipo: "pesos" },
      { etiqueta: "Recargas", valor: t.recargas, tipo: "pesos" },
      { etiqueta: "Retiros", valor: t.retiros, tipo: "pesos" },
      { etiqueta: "Operaciones", valor: t.operaciones, tipo: "numero" },
    ],
    tablas: [
      {
        titulo: "Por día",
        columnas: [
          { titulo: "Día", tipo: "texto" },
          { titulo: "Operaciones", tipo: "numero" },
          { titulo: "Plata movida", tipo: "pesos" },
          { titulo: "Comisiones", tipo: "pesos" },
        ],
        filas: [...porDia.values()].reverse().map((d) => [d.dia, d.n, d.movido, d.comisiones]),
        total: ["Total", t.operaciones, t.movido, t.comisiones],
      },
      {
        titulo: "Detalle",
        columnas: [
          { titulo: "Día", tipo: "texto" },
          { titulo: "Hora", tipo: "texto" },
          { titulo: "Tipo", tipo: "texto" },
          { titulo: "Valor", tipo: "pesos" },
          { titulo: "Comisión", tipo: "pesos" },
          { titulo: "Pagó con", tipo: "texto" },
          { titulo: "Quién", tipo: "texto" },
          { titulo: "Nota", tipo: "texto" },
          { titulo: "Estado", tipo: "texto" },
        ],
        filas: operaciones.map((o) => [
          formatearFecha(o.fecha),
          formatearHora(o.creadoEn),
          NOMBRE_OPERACION_PAC[o.tipo],
          o.valor,
          o.comision,
          o.tipo === "RETIRO" ? "Se entregó efectivo" : o.medio === "EFECTIVO" ? "Efectivo" : "Transferencia",
          o.usuario,
          o.nota ?? "",
          o.anulado ? `Anulada: ${o.motivoAnulacion ?? ""}` : "",
        ]),
      },
    ],
    nota: "El PAC no cuenta como venta ni en la utilidad del negocio.",
  };
}
