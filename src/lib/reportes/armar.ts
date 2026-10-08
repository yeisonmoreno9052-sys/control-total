// Cada reporte se arma una sola vez como "tarjetas + tablas". La pantalla, el Excel y la
// versión para imprimir (PDF) dibujan esa misma estructura, así los números siempre coinciden.
import type { Contexto } from "@/lib/datos/contexto";
import { CATEGORIAS_CAJA } from "@/lib/datos/movimientos-caja";
import { listarNegocios } from "@/lib/datos/negocios";
import {
  gastosDelPeriodo,
  inventarioValorizado,
  negociosDelReporte,
  productosSinVentas,
  productosVendidos,
  resumenVentas,
  utilidadPorCondicion,
  ventasPorCajero,
  ventasPorDia,
  ventasPorMedio,
} from "@/lib/datos/reportes";
import { formatearCantidad } from "@/lib/inventario/cantidades";
import { UNIDADES } from "@/lib/inventario/unidades";
import type { UnidadMedida } from "@/generated/prisma/enums";
import { describirPeriodo, diasEntre, periodoDeParametros, type Periodo } from "./periodos";

export const VISTAS = [
  { valor: "ventas", nombre: "Ventas" },
  { valor: "utilidad", nombre: "Utilidad" },
  { valor: "productos", nombre: "Productos" },
  { valor: "inventario", nombre: "Inventario" },
  { valor: "gastos", nombre: "Gastos" },
] as const;

export type Vista = (typeof VISTAS)[number]["valor"];

export type TipoDato = "texto" | "pesos" | "numero" | "porcentaje";
export type Celda = string | number | null;

export type Tarjeta = { etiqueta: string; valor: number; tipo: TipoDato; ayuda?: string; destacada?: boolean };
export type Tabla = {
  titulo: string;
  columnas: { titulo: string; tipo: TipoDato }[];
  filas: Celda[][];
  total?: Celda[];
  vacia?: string;
};
export type Reporte = {
  vista: Vista;
  titulo: string;
  negocio: string;
  /** null en inventario: es la foto de hoy, no de unas fechas. */
  periodo: string | null;
  tarjetas: Tarjeta[];
  /** Ventas por día, para la gráfica. */
  grafica?: { dia: string; total: number }[];
  tablas: Tabla[];
  nota?: string;
};

export type Parametros = Record<string, string | string[] | undefined>;

const texto = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

const NOMBRE_MEDIO: Record<string, string> = { EFECTIVO: "Efectivo", TRANSFERENCIA: "Transferencia" };

export function leerVista(p: Parametros): Vista {
  const v = texto(p.vista);
  return VISTAS.some((x) => x.valor === v) ? (v as Vista) : "ventas";
}

/** Negocios elegidos, su nombre para el título y la lista para el selector. */
export async function negociosParaReporte(ctx: Contexto, negocioActivoId: string | null, p: Parametros) {
  const ids = negociosDelReporte(ctx, texto(p.negocio), negocioActivoId);
  const negocios = await listarNegocios(ctx);
  const nombre =
    ids.length > 1 || texto(p.negocio) === "todos" ? "Todos los negocios" : (negocios.find((n) => n.id === ids[0])?.nombre ?? "");
  return {
    ids,
    nombre,
    opciones: negocios.map((n) => ({ id: n.id, nombre: n.nombre })),
    valor: texto(p.negocio) === "todos" ? "todos" : ids[0],
  };
}

const cantidad = (c: string, unidad: string) => `${formatearCantidad(c)} ${UNIDADES[unidad as UnidadMedida]?.corto ?? ""}`.trim();

export async function armarReporte(
  ctx: Contexto,
  vista: Vista,
  negocioIds: string[],
  negocio: string,
  periodo: Periodo,
): Promise<Reporte> {
  const { desde, hasta } = periodo;
  const comun = { vista, negocio, periodo: describirPeriodo(periodo) };

  if (vista === "ventas") {
    const [r, dias, cajeros, medios] = await Promise.all([
      resumenVentas(ctx, negocioIds, desde, hasta),
      ventasPorDia(ctx, negocioIds, desde, hasta),
      ventasPorCajero(ctx, negocioIds, desde, hasta),
      ventasPorMedio(ctx, negocioIds, desde, hasta),
    ]);
    return {
      ...comun,
      titulo: "Reporte de ventas",
      tarjetas: [
        {
          etiqueta: "Total vendido",
          valor: r.totalVendido,
          tipo: "pesos",
          destacada: true,
          ayuda: "Lo cobrado, menos devoluciones",
        },
        { etiqueta: "Ventas", valor: r.ventas, tipo: "numero" },
        { etiqueta: "Ticket promedio", valor: r.ticketPromedio, tipo: "pesos" },
        { etiqueta: "Descuentos dados", valor: r.descuentos, tipo: "pesos" },
        { etiqueta: "Devoluciones", valor: r.devoluciones, tipo: "pesos" },
        { etiqueta: "Ventas anuladas", valor: r.anuladas, tipo: "numero", ayuda: `Por ${pesosTexto(r.totalAnulado)}` },
      ],
      grafica: diasEntre(desde, hasta) > 1 ? dias.map((d) => ({ dia: d.dia, total: d.total })) : undefined,
      tablas: [
        {
          titulo: "Por día",
          columnas: [
            { titulo: "Día", tipo: "texto" },
            { titulo: "Ventas", tipo: "numero" },
            { titulo: "Total", tipo: "pesos" },
          ],
          filas: dias.filter((d) => d.ventas).map((d) => [diaTexto(d.dia), d.ventas, d.total]),
          total: ["Total", r.ventas, r.totalVendido],
          vacia: "No hubo ventas en estas fechas.",
        },
        {
          titulo: "Por cajero",
          columnas: [
            { titulo: "Cajero", tipo: "texto" },
            { titulo: "Ventas", tipo: "numero" },
            { titulo: "Descuentos", tipo: "pesos" },
            { titulo: "Total", tipo: "pesos" },
          ],
          filas: cajeros.map((c) => [c.usuario, c.ventas, c.descuentos, c.total]),
          vacia: "No hubo ventas en estas fechas.",
        },
        {
          titulo: "Por medio de pago",
          columnas: [
            { titulo: "Medio", tipo: "texto" },
            { titulo: "Recibido", tipo: "pesos" },
            { titulo: "Devuelto", tipo: "pesos" },
            { titulo: "Neto", tipo: "pesos" },
          ],
          filas: medios.map((m) => [NOMBRE_MEDIO[m.medio] ?? m.medio, m.total, m.devoluciones, m.total - m.devoluciones]),
          vacia: "No hubo ventas en estas fechas.",
        },
      ],
    };
  }

  if (vista === "utilidad") {
    const [r, g, dias, condicion] = await Promise.all([
      resumenVentas(ctx, negocioIds, desde, hasta),
      gastosDelPeriodo(ctx, negocioIds, desde, hasta),
      ventasPorDia(ctx, negocioIds, desde, hasta),
      utilidadPorCondicion(ctx, negocioIds, desde, hasta),
    ]);
    const filaCondicion = (nombre: string, x: typeof condicion.nuevo): Celda[] => [
      nombre,
      x.ventasNetas,
      x.costo,
      x.utilidad,
      x.margen,
    ];
    // Solo aparece si se vendió algo de segunda en estas fechas.
    const tablaCondicion: Tabla[] =
      condicion.segunda.ventasNetas || condicion.segunda.costo
        ? [
            {
              titulo: "Nuevo y de segunda",
              columnas: [
                { titulo: "Productos", tipo: "texto" },
                { titulo: "Ventas netas", tipo: "pesos" },
                { titulo: "Costo", tipo: "pesos" },
                { titulo: "Utilidad bruta", tipo: "pesos" },
                { titulo: "Margen", tipo: "porcentaje" },
              ],
              filas: [filaCondicion("Nuevos", condicion.nuevo), filaCondicion("De segunda", condicion.segunda)],
            },
          ]
        : [];
    const neta = r.utilidadBruta - g.gastos;
    const filas: Celda[][] = [["Total vendido (menos devoluciones)", r.totalVendido]];
    if (r.ivaResponsable) filas.push(["− IVA cobrado (es de la DIAN)", -r.ivaResponsable]);
    filas.push(["Ventas netas", r.ventasNetas], ["− Costo de lo vendido", -r.costo], ["Utilidad bruta", r.utilidadBruta]);
    for (const c of g.categorias.filter((x) => CATEGORIAS_CAJA[x.categoria].gasto)) {
      filas.push([`− ${CATEGORIAS_CAJA[c.categoria].nombre}`, -c.valor]);
    }
    return {
      ...comun,
      titulo: "Reporte de utilidad",
      tarjetas: [
        { etiqueta: "Utilidad neta", valor: neta, tipo: "pesos", destacada: true, ayuda: "Utilidad bruta menos gastos" },
        { etiqueta: "Utilidad bruta", valor: r.utilidadBruta, tipo: "pesos", ayuda: "Ventas netas menos costo" },
        { etiqueta: "Margen bruto", valor: r.margen ?? 0, tipo: "porcentaje" },
        { etiqueta: "Gastos", valor: g.gastos, tipo: "pesos" },
        { etiqueta: "Retiros del dueño", valor: g.retiros, tipo: "pesos", ayuda: "No se restan de la utilidad" },
      ],
      tablas: [
        {
          titulo: "Estado de resultados",
          columnas: [
            { titulo: "Concepto", tipo: "texto" },
            { titulo: "Valor", tipo: "pesos" },
          ],
          filas,
          total: ["Utilidad neta", neta],
        },
        ...tablaCondicion,
        {
          titulo: "Utilidad bruta por día",
          columnas: [
            { titulo: "Día", tipo: "texto" },
            { titulo: "Vendido", tipo: "pesos" },
            { titulo: "Utilidad bruta", tipo: "pesos" },
          ],
          filas: dias.filter((d) => d.ventas).map((d) => [diaTexto(d.dia), d.total, d.utilidad]),
          vacia: "No hubo ventas en estas fechas.",
        },
      ],
      nota: "El costo es el que tenía cada producto al momento de venderlo. En negocios responsables de IVA se toma la venta y el costo sin IVA.",
    };
  }

  if (vista === "productos") {
    const [masVendidos, porUtilidad, menos, sinVentas] = await Promise.all([
      productosVendidos(ctx, negocioIds, desde, hasta, "total", "mas", 30),
      productosVendidos(ctx, negocioIds, desde, hasta, "utilidad", "mas", 30),
      productosVendidos(ctx, negocioIds, desde, hasta, "cantidad", "menos", 30),
      productosSinVentas(ctx, negocioIds, desde, hasta, 50),
    ]);
    const columnas: Tabla["columnas"] = [
      { titulo: "Código", tipo: "texto" },
      { titulo: "Producto", tipo: "texto" },
      { titulo: "Cantidad", tipo: "texto" },
      { titulo: "Vendido", tipo: "pesos" },
      { titulo: "Utilidad", tipo: "pesos" },
    ];
    const fila = (p: (typeof masVendidos)[number]): Celda[] => [
      p.codigo,
      p.nombre,
      cantidad(p.cantidad, p.unidad),
      p.total,
      p.utilidad,
    ];
    return {
      ...comun,
      titulo: "Reporte de productos",
      tarjetas: [{ etiqueta: "Productos con stock que no se vendieron", valor: sinVentas.total, tipo: "numero" }],
      tablas: [
        {
          titulo: "Los que más venden (en plata)",
          columnas,
          filas: masVendidos.map(fila),
          vacia: "No hubo ventas en estas fechas.",
        },
        {
          titulo: "Los que más utilidad dejan",
          columnas,
          filas: porUtilidad.map(fila),
          vacia: "No hubo ventas en estas fechas.",
        },
        { titulo: "Los que menos se venden", columnas, filas: menos.map(fila), vacia: "No hubo ventas en estas fechas." },
        {
          titulo: `Sin ventas en estas fechas${sinVentas.total > sinVentas.productos.length ? ` (los ${sinVentas.productos.length} con más plata quieta)` : ""}`,
          columnas: [
            { titulo: "Código", tipo: "texto" },
            { titulo: "Producto", tipo: "texto" },
            { titulo: "Stock", tipo: "texto" },
            { titulo: "Valor a costo", tipo: "pesos" },
          ],
          filas: sinVentas.productos.map((p) => [p.codigo, p.nombre, cantidad(p.stock, p.unidad), p.valor]),
          vacia: "Todos los productos con stock se vendieron al menos una vez.",
        },
      ],
    };
  }

  if (vista === "inventario") {
    const r = await inventarioValorizado(ctx, negocioIds);
    return {
      ...comun,
      periodo: null,
      titulo: "Inventario valorizado",
      tarjetas: [
        { etiqueta: "Valor a costo", valor: r.costo, tipo: "pesos", destacada: true, ayuda: "Lo que costó lo que hay en bodega" },
        { etiqueta: "Valor a precio de venta", valor: r.venta, tipo: "pesos" },
        { etiqueta: "Ganancia si se vende todo", valor: r.venta - r.costo, tipo: "pesos" },
        { etiqueta: "Productos con stock", valor: r.productos, tipo: "numero" },
      ],
      tablas: [
        {
          titulo: "Por categoría",
          columnas: [
            { titulo: "Categoría", tipo: "texto" },
            { titulo: "Productos", tipo: "numero" },
            { titulo: "A costo", tipo: "pesos" },
            { titulo: "A precio de venta", tipo: "pesos" },
          ],
          filas: r.porCategoria.map((c) => [c.categoria, c.productos, c.costo, c.venta]),
          total: ["Total", r.productos, r.costo, r.venta],
          vacia: "No hay productos con stock.",
        },
      ],
      nota: "Es el inventario de hoy, con el costo promedio actual de cada producto.",
    };
  }

  const g = await gastosDelPeriodo(ctx, negocioIds, desde, hasta);
  return {
    ...comun,
    titulo: "Reporte de gastos",
    tarjetas: [
      { etiqueta: "Gastos", valor: g.gastos, tipo: "pesos", destacada: true },
      { etiqueta: "Retiros del dueño", valor: g.retiros, tipo: "pesos", ayuda: "No son gasto del negocio" },
    ],
    tablas: [
      {
        titulo: "Egresos por categoría",
        columnas: [
          { titulo: "Categoría", tipo: "texto" },
          { titulo: "Valor", tipo: "pesos" },
        ],
        filas: g.categorias.map((c) => [CATEGORIAS_CAJA[c.categoria].nombre, c.valor]),
        total: ["Total egresos", g.categorias.reduce((a, c) => a + c.valor, 0)],
        vacia: "No hay egresos en estas fechas.",
      },
      {
        titulo: "Nómina por empleado",
        columnas: [
          { titulo: "Empleado", tipo: "texto" },
          { titulo: "Pagado", tipo: "pesos" },
        ],
        filas: g.nomina.map((n) => [n.empleado, n.valor]),
        vacia: "No hay pagos de nómina en estas fechas.",
      },
    ],
  };
}

/** Lo que piden la pantalla, el Excel y la impresión: negocio(s), periodo y vista desde la dirección. */
export async function reporteDesdeParametros(ctx: Contexto, negocioActivoId: string | null, p: Parametros) {
  const vista = leerVista(p);
  const negocios = await negociosParaReporte(ctx, negocioActivoId, p);
  const periodo = periodoDeParametros(p, "mes");
  const reporte = await armarReporte(ctx, vista, negocios.ids, negocios.nombre, periodo);
  return { vista, negocios, periodo, reporte };
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
export function diaTexto(dia: string) {
  const d = new Date(`${dia}T00:00:00.000Z`);
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}

function pesosTexto(n: number) {
  return `$ ${new Intl.NumberFormat("es-CO").format(n)}`;
}
