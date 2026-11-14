// Estados de WhatsApp: lo que se publica de cada prenda o producto.
// Aquí solo hay cálculos (sin base de datos ni navegador) para poder probarlos.
import { formatearPesos } from "@/lib/formato";

/** Una prenda (con todas sus tallas) o un producto suelto, listo para publicar. */
export type PiezaEstado = {
  /** Producto al que lleva el enlace (en una prenda, la primera talla). */
  productoId: string;
  prendaId: string | null;
  nombre: string;
  descripcion: string | null;
  /** Precio más bajo de lo que hay en stock. */
  precio: number;
  /** Tallas que hay en stock, en el orden en que se crearon. Vacío si no maneja tallas. */
  tallas: string[];
  fotoUrl: string | null;
};

export type VarianteEstado = {
  id: string;
  nombre: string;
  prenda: string | null;
  prendaId: string | null;
  descripcion: string | null;
  talla: string | null;
  precioVenta: number;
  /** Cantidad en stock (texto con decimales, como la guarda la base). */
  stock: string;
  controlaStock: boolean;
  fotoUrl: string | null;
};

const comparable = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

const hayStock = (v: VarianteEstado) => !v.controlaStock || Number(v.stock) > 0;

/**
 * Junta las tallas de una prenda en una sola pieza: solo las tallas que tienen stock,
 * sin repetir (la misma talla en dos colores sale una vez), el precio más bajo y la
 * primera foto que encuentre. Si no queda nada en stock, igual muestra la prenda.
 */
export function resumirPieza(variantes: VarianteEstado[]): PiezaEstado | null {
  if (!variantes.length) return null;
  const primera = variantes[0];
  const conStock = variantes.filter(hayStock);
  const base = conStock.length ? conStock : variantes;
  const tallas: string[] = [];
  for (const v of conStock) {
    if (v.talla && !tallas.some((t) => comparable(t) === comparable(v.talla!))) tallas.push(v.talla.trim());
  }
  return {
    productoId: primera.id,
    prendaId: primera.prendaId,
    nombre: (primera.prendaId ? primera.prenda : null) ?? primera.nombre,
    descripcion: variantes.find((v) => v.descripcion)?.descripcion ?? null,
    precio: Math.min(...base.map((v) => v.precioVenta)),
    tallas,
    fotoUrl: (base.find((v) => v.fotoUrl) ?? variantes.find((v) => v.fotoUrl))?.fotoUrl ?? null,
  };
}

/**
 * Agrupa una lista de productos (de la más nueva a la más vieja) en piezas: las tallas
 * de una misma prenda quedan juntas, en el lugar de la más nueva, y sus tallas en el
 * orden en que se crearon (6, 8, 10 y no 10, 8, 6).
 */
export function agruparPiezas(variantes: VarianteEstado[], limite: number): PiezaEstado[] {
  const grupos = new Map<string, VarianteEstado[]>();
  for (const v of variantes) {
    const clave = v.prendaId ? `prenda:${v.prendaId}` : `producto:${v.id}`;
    const grupo = grupos.get(clave);
    if (grupo) grupo.push(v);
    else if (grupos.size < limite) grupos.set(clave, [v]);
  }
  return [...grupos.values()].map((g) => resumirPieza([...g].reverse())!).filter(Boolean);
}

/** Convierte "6, 8 y 10" o "S M L" en la lista de tallas. */
export function leerTallas(texto: string): string[] {
  return texto
    .split(/\s*(?:,|;|\/|\s+y\s+|\s+)\s*/i)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12);
}

/** "6, 8 y 10" */
export function unirTallas(tallas: string[]) {
  if (tallas.length <= 1) return tallas.join("");
  return `${tallas.slice(0, -1).join(", ")} y ${tallas[tallas.length - 1]}`;
}

/** Cuánto se rebaja, en porcentaje entero. null si no es una rebaja. */
export function porcentajeRebaja(antes: number, ahora: number) {
  if (!(antes > 0) || !(ahora > 0) || ahora >= antes) return null;
  return Math.round(((antes - ahora) / antes) * 100);
}

export type Etiqueta = "ninguna" | "nuevo" | "ultimas";

export const ETIQUETAS: Record<Etiqueta, string> = {
  ninguna: "Sin etiqueta",
  nuevo: "Nuevo",
  ultimas: "Últimas unidades",
};

/** Lo que se ve en la imagen de una sola prenda. */
export type DisenoPieza = {
  nombre: string;
  detalle: string;
  tallas: string[];
  precio: number;
  /** Precio de oferta. Si es menor que el precio, el precio sale tachado. */
  oferta: number | null;
  etiqueta: Etiqueta;
  telefono: string;
};

/** Texto para acompañar la imagen (o para mandar por chat). */
export function textoPieza(d: DisenoPieza) {
  const rebaja = d.oferta ? porcentajeRebaja(d.precio, d.oferta) : null;
  const lineas = [
    d.etiqueta === "ultimas" ? "🔥 ¡Últimas unidades!" : d.etiqueta === "nuevo" ? "✨ ¡Nuevo!" : null,
    `*${d.nombre.trim()}*`,
    d.detalle.trim() || null,
    d.tallas.length ? `Tallas: ${unirTallas(d.tallas)}` : null,
    rebaja
      ? `Antes ${formatearPesos(d.precio)}, ahora *${formatearPesos(d.oferta!)}* (-${rebaja} %)`
      : `Precio: *${formatearPesos(d.precio)}*`,
    d.telefono.trim() ? `Escríbenos al ${d.telefono.trim()} 📲` : null,
  ];
  return lineas.filter(Boolean).join("\n");
}

/** Lo que se ve en el collage de mercancía nueva. */
export type DisenoCollage = {
  titulo: string;
  nota: string;
  /** oferta: precio de promoción; si es menor que el precio, el precio sale tachado. */
  piezas: { nombre: string; precio: number; oferta: number | null; fotoUrl: string | null }[];
  telefono: string;
};

/** ¿Alguna prenda del collage está en promoción? */
export function hayPromocion(d: Pick<DisenoCollage, "piezas">) {
  return d.piezas.some((p) => p.oferta !== null && porcentajeRebaja(p.precio, p.oferta) !== null);
}

/** Precio con un descuento general, redondeado a los $100 más cercanos ($89.900 -20 % = $71.900). */
export function aplicarDescuento(precio: number, porcentaje: number | null) {
  if (!porcentaje || porcentaje <= 0 || porcentaje >= 100) return null;
  return Math.round((precio * (100 - porcentaje)) / 100 / 100) * 100;
}

export function textoCollage(d: DisenoCollage) {
  return [
    `✨ *${d.titulo.trim()}* ✨`,
    "",
    ...d.piezas.map((p) =>
      p.oferta !== null && porcentajeRebaja(p.precio, p.oferta)
        ? `• ${p.nombre}: ~${formatearPesos(p.precio)}~ *${formatearPesos(p.oferta)}*`
        : `• ${p.nombre}: ${formatearPesos(p.precio)}`,
    ),
    d.nota.trim() ? `\n${d.nota.trim()}` : null,
    d.telefono.trim() ? `Escríbenos al ${d.telefono.trim()} 📲` : null,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

/** Columnas y filas del collage según cuántas prendas hay (máximo 6). */
export function rejillaCollage(n: number): { columnas: number; filas: number } {
  if (n <= 1) return { columnas: 1, filas: 1 };
  if (n === 2) return { columnas: 2, filas: 1 };
  if (n === 3) return { columnas: 3, filas: 1 };
  if (n === 4) return { columnas: 2, filas: 2 };
  return { columnas: 3, filas: 2 };
}

export const MAXIMO_COLLAGE = 6;

/** Nombre del archivo de la imagen: "estado-jean-tiro-alto.png". */
export function nombreArchivo(texto: string) {
  const limpio = comparable(texto)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `estado-${limpio || "prenda"}.png`;
}
