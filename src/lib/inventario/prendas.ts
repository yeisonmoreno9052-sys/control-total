// Prendas con tallas y colores (almacenes de ropa y calzado).
//
// Cada combinación de talla y color es un producto normal, con su propio stock, código
// y etiqueta. Así la caja, los reportes, las compras y las devoluciones funcionan igual
// que con cualquier producto. Los de la misma prenda comparten `prendaId`.
import { z } from "zod";
import { leerPesos } from "./esquemas";
import { IVAS } from "./unidades";

/** Tallas que se ofrecen con un toque al crear la prenda. */
export const TALLAS_RAPIDAS: { nombre: string; tallas: string[] }[] = [
  { nombre: "Letras", tallas: ["XS", "S", "M", "L", "XL"] },
  { nombre: "Números", tallas: ["6", "8", "10", "12", "14", "16"] },
  { nombre: "Jean dama", tallas: ["4", "6", "8", "10", "12", "14"] },
  { nombre: "Jean hombre", tallas: ["28", "30", "32", "34", "36", "38"] },
  { nombre: "Calzado", tallas: ["35", "36", "37", "38", "39", "40"] },
  { nombre: "Única", tallas: ["Única"] },
];

export const MAX_TALLAS = 20;
export const MAX_COLORES = 20;

/** "  azul  claro " → "Azul claro". Primera letra en mayúscula, espacios limpios. */
export function limpiarOpcion(texto: string) {
  const t = texto.trim().replace(/\s+/g, " ");
  return t ? t.charAt(0).toLocaleUpperCase("es") + t.slice(1) : "";
}

/** Quita repetidas sin importar mayúsculas ni tildes, conservando el orden. */
export function sinRepetidas(lista: string[]) {
  const vistas = new Set<string>();
  const salida: string[] = [];
  for (const item of lista.map(limpiarOpcion)) {
    const clave = normalizar(item);
    if (!clave || vistas.has(clave)) continue;
    vistas.add(clave);
    salida.push(item);
  }
  return salida;
}

/** Para comparar: minúsculas y sin tildes. */
export function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Nombre del producto de una talla y color: "Blusa Lina - M - Negro". */
export function nombreVariante(prenda: string, talla: string, color: string | null) {
  return [prenda, talla, color].filter(Boolean).join(" - ");
}

/** Clave de una combinación en el cuadro de cantidades. */
export function claveVariante(talla: string, color: string | null) {
  return `${normalizar(talla)}|${normalizar(color ?? "")}`;
}

/** Letras y números en mayúscula, sin tildes ni espacios: sirve para el código de barras (Code 128). */
function soloCodigo(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** "Única" → "U", "XL" → "XL", "10" → "10". Máximo 4 caracteres. */
export function abreviarTalla(talla: string) {
  const c = soloCodigo(talla);
  if (normalizar(talla) === "unica") return "U";
  return c.slice(0, 4) || "T";
}

/** "Negro" → "NEG", "Azul claro" → "AZC", "Verde menta oscuro" → "VEMO". */
export function abreviarColor(color: string) {
  const palabras = color.split(/\s+/).map(soloCodigo).filter(Boolean);
  if (!palabras.length) return "C";
  if (palabras.length === 1) return palabras[0].slice(0, 3);
  return (palabras[0].slice(0, 2) + palabras.slice(1).map((p) => p[0]).join("")).slice(0, 4);
}

/**
 * Códigos de cada combinación a partir del código de la prenda: PR-0001-M-NEG.
 * Si dos colores dan la misma abreviatura ("Azul" y "Azulado") se numeran.
 */
export function codigosVariantes(base: string, tallas: string[], colores: string[]) {
  const usadas = new Map<string, number>();
  const abrevColor = new Map<string, string>();
  for (const color of colores) {
    let a = abreviarColor(color);
    const n = usadas.get(a) ?? 0;
    usadas.set(a, n + 1);
    if (n > 0) a = `${a}${n + 1}`;
    abrevColor.set(color, a);
  }
  const usadasTalla = new Map<string, number>();
  const abrevTalla = new Map<string, string>();
  for (const talla of tallas) {
    let a = abreviarTalla(talla);
    const n = usadasTalla.get(a) ?? 0;
    usadasTalla.set(a, n + 1);
    if (n > 0) a = `${a}${n + 1}`;
    abrevTalla.set(talla, a);
  }
  return (talla: string, color: string | null) =>
    [base, abrevTalla.get(talla) ?? abreviarTalla(talla), color ? (abrevColor.get(color) ?? abreviarColor(color)) : null]
      .filter(Boolean)
      .join("-");
}

const lista = (max: number, nombre: string) =>
  z
    .array(z.string())
    .transform((v) => sinRepetidas(v))
    .pipe(
      z
        .array(z.string().max(20, `Cada ${nombre} puede tener máximo 20 letras.`))
        .max(max, `Máximo ${max} ${nombre === "talla" ? "tallas" : "colores"}.`),
    );

const pesos = (nombre: string) =>
  z.union([z.string(), z.number()]).transform((v, ctx) => {
    const valor = leerPesos(v);
    if (valor === null || valor < 0) {
      ctx.addIssue({ code: "custom", message: `Escribe ${nombre} válido, por ejemplo 45.000.` });
      return z.NEVER;
    }
    return valor;
  });

const unidades = z.union([z.string(), z.number()]).transform((v, ctx) => {
  const t = String(v ?? "").trim();
  if (!t) return 0;
  if (!/^\d{1,5}$/.test(t)) {
    ctx.addIssue({ code: "custom", message: "Escribe cuántas unidades, sin decimales." });
    return z.NEVER;
  }
  return Number(t);
});

/** Lo que llega del formulario "Nueva prenda". */
export const esquemaPrenda = z
  .object({
    nombre: z.string().trim().min(1, "Escribe el nombre de la prenda.").max(120, "Máximo 120 caracteres."),
    descripcion: z
      .string()
      .trim()
      .max(500)
      .transform((v) => v || null)
      .nullable()
      .optional(),
    categoriaId: z
      .string()
      .trim()
      .max(40)
      .transform((v) => v || null)
      .nullable()
      .optional(),
    costo: pesos("un costo"),
    precioVenta: pesos("un precio"),
    porcentajeIva: z.coerce
      .number()
      .refine((v) => (IVAS as readonly number[]).includes(v), "El IVA debe ser 0, 5 o 19 %."),
    stockMinimo: unidades,
    tallas: lista(MAX_TALLAS, "talla"),
    colores: lista(MAX_COLORES, "color"),
    /** { "m|negro": "3" } con la clave de claveVariante(). */
    cantidades: z.record(z.string(), unidades).default({}),
  })
  .superRefine((p, ctx) => {
    if (p.precioVenta <= 0) {
      ctx.addIssue({ code: "custom", path: ["precioVenta"], message: "El precio de venta debe ser mayor que cero." });
    }
    if (!p.tallas.length) ctx.addIssue({ code: "custom", path: ["tallas"], message: "Agrega al menos una talla." });
  });

export type PrendaEntrada = z.infer<typeof esquemaPrenda>;

/** Agregar tallas o colores a una prenda que ya existe. */
export const esquemaAgregarVariantes = z
  .object({
    tallas: lista(MAX_TALLAS, "talla"),
    colores: lista(MAX_COLORES, "color"),
    cantidades: z.record(z.string(), unidades).default({}),
  })
  .superRefine((p, ctx) => {
    if (!p.tallas.length) ctx.addIssue({ code: "custom", path: ["tallas"], message: "Agrega al menos una talla." });
  });

export type AgregarVariantesEntrada = z.infer<typeof esquemaAgregarVariantes>;

/** Todas las combinaciones de talla y color (sin colores: solo tallas). */
export function combinaciones(tallas: string[], colores: string[]) {
  const cs = colores.length ? colores : [null];
  return cs.flatMap((color) => tallas.map((talla) => ({ talla, color })));
}

/**
 * Deja juntas las tallas y colores de cada prenda, en el lugar alfabético de la prenda,
 * y dentro de ella en el orden en que se crearon (S, M, L…).
 */
export function ordenarConPrendas<T extends { nombre: string; prendaId?: string | null; prenda?: string | null }>(lista: T[]) {
  const grupos = new Map<string, T[]>();
  const orden: { clave: string; nombre: string }[] = [];
  for (const p of lista) {
    const clave = p.prendaId ? `p:${p.prendaId}` : `s:${orden.length}:${p.nombre}`;
    if (!grupos.has(clave)) {
      grupos.set(clave, []);
      orden.push({ clave, nombre: p.prendaId ? (p.prenda ?? p.nombre) : p.nombre });
    }
    grupos.get(clave)!.push(p);
  }
  orden.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return orden.flatMap((o) => grupos.get(o.clave)!);
}
