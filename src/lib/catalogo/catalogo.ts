// Catálogo en línea: cuentas y textos que no tocan la base de datos (se prueban solos).
// Las consultas están en src/lib/datos/catalogo-publico.ts (lo que ve el cliente) y
// src/lib/datos/catalogo.ts (lo que ve el negocio).
import { formatearPesos } from "@/lib/formato";
import { normalizar } from "@/lib/inventario/prendas";

// ---------------------------------------------------------------------------
// Link del catálogo
// ---------------------------------------------------------------------------

/** Palabras que no se pueden usar como link (rutas de la app o confusas). */
const RESERVADOS = new Set(["api", "admin", "emy", "panel", "ingresar", "salir", "catalogo", "c", "p", "demo", "control", "controltotal"]);

/** "DB Shop!" → "dbshop"; "Ferretería El Tornillo" → "ferreteria-el-tornillo". */
export function sugerirSlug(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

/** Revisa el link que escribió el negocio. Devuelve el error en palabras o null si sirve. */
export function errorSlug(slug: string): string | null {
  if (slug.length < 3) return "El link debe tener al menos 3 letras.";
  if (slug.length > 40) return "El link es muy largo: máximo 40 letras.";
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return "Usa solo letras sin tildes, números y guiones (por ejemplo dbshop).";
  if (RESERVADOS.has(slug)) return "Ese link no se puede usar. Prueba con el nombre de la tienda.";
  return null;
}

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

/**
 * Número para wa.me: solo dígitos con el indicativo. "300 123 4567" → "573001234567".
 * Devuelve null si no parece un celular válido.
 */
export function numeroWhatsapp(texto: string | null | undefined): string | null {
  if (!texto) return null;
  let d = texto.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  // Celular de Colombia sin indicativo: 10 dígitos que empiezan por 3.
  if (d.length === 10 && d.startsWith("3")) return `57${d}`;
  if (d.length === 12 && d.startsWith("573")) return d;
  // Otros países: con indicativo, entre 10 y 15 dígitos.
  if (d.length >= 11 && d.length <= 15 && !d.startsWith("57")) return d;
  return null;
}

export function linkWhatsapp(numero: string, mensaje: string) {
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}

export type LineaPedido = {
  nombre: string;
  talla?: string | null;
  color?: string | null;
  cantidad: number;
  /** Precio por unidad que ve el cliente (con la promoción, si hay). */
  precio: number;
  link?: string;
};

/** Un renglón legible: "Jean Rosalía · Talla 8 · Negro". */
export function describirLinea(l: Pick<LineaPedido, "nombre" | "talla" | "color">) {
  return [l.nombre, l.talla ? `Talla ${l.talla}` : null, l.color].filter(Boolean).join(" · ");
}

/** El mensaje que le llega al negocio por WhatsApp. Una prenda o la bolsa completa. */
export function mensajePedido(negocio: string, lineas: LineaPedido[]) {
  if (lineas.length === 1 && lineas[0].cantidad === 1) {
    const l = lineas[0];
    return [
      `¡Hola ${negocio}! Me interesa esta prenda del catálogo:`,
      "",
      `🛍️ *${l.nombre}*`,
      l.talla ? `Talla: *${l.talla}*` : null,
      l.color ? `Color: *${l.color}*` : null,
      `Precio: *${formatearPesos(l.precio)}*`,
      l.link ?? null,
      "",
      "¿Está disponible?",
    ]
      .filter((x) => x !== null)
      .join("\n");
  }
  const total = lineas.reduce((s, l) => s + l.precio * l.cantidad, 0);
  const unidades = lineas.reduce((s, l) => s + l.cantidad, 0);
  return [
    `¡Hola ${negocio}! Quiero hacer este pedido del catálogo:`,
    "",
    ...lineas.map((l, i) => `${i + 1}. ${describirLinea(l)}${l.cantidad > 1 ? ` x${l.cantidad}` : ""} = ${formatearPesos(l.precio * l.cantidad)}`),
    "",
    `*Total: ${formatearPesos(total)}* (${unidades} ${unidades === 1 ? "prenda" : "prendas"})`,
    "",
    "¿Está todo disponible?",
  ].join("\n");
}

/** El mensaje con el que el negocio le avisa al cliente que llegó su talla. */
export function mensajeLlego(negocio: string, aviso: { cliente?: string | null; nombre: string; talla?: string | null; color?: string | null }, link?: string) {
  const saludo = aviso.cliente ? `¡Hola ${aviso.cliente.split(" ")[0]}!` : "¡Hola!";
  return [
    `${saludo} Te escribimos de ${negocio} 🎉`,
    `Ya llegó lo que estabas esperando: *${describirLinea(aviso)}*.`,
    link ? `Míralo aquí: ${link}` : null,
    "¿Te la separamos?",
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Promociones
// ---------------------------------------------------------------------------

export type PromoCatalogo = { nombre: string; tipo: "PORCENTAJE" | "PRECIO"; valor: number; desde: string; hasta: string };

/** Precio con la promoción, o null si no aplica (igual que la caja: el precio especial solo si es menor). */
export function precioConPromo(precio: number, p: PromoCatalogo | null | undefined, hoy: string): number | null {
  if (!p || p.desde > hoy || hoy > p.hasta) return null;
  if (p.tipo === "PORCENTAJE") {
    if (p.valor <= 0 || p.valor >= 100) return null;
    return precio - Math.round((precio * p.valor) / 100);
  }
  return p.valor < precio ? p.valor : null;
}

/** "-20 %" para la etiqueta de la tarjeta. */
export function etiquetaPromo(precio: number, conPromo: number) {
  const pct = Math.round(((precio - conPromo) / precio) * 100);
  return pct > 0 ? `-${pct} %` : "Oferta";
}

const diasEntre = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** "Termina hoy", "Termina mañana", "Termina en 3 días" o "Hasta el 30/11". */
export function cuentaRegresiva(hasta: string, hoy: string) {
  const dias = diasEntre(hoy, hasta);
  if (dias < 0) return null;
  if (dias === 0) return "¡Último día!";
  if (dias === 1) return "Termina mañana";
  if (dias <= 7) return `Termina en ${dias} días`;
  const [, m, d] = hasta.split("-");
  return `Hasta el ${d}/${m}`;
}

// ---------------------------------------------------------------------------
// Tarjetas: las tallas y colores de una prenda se juntan en una sola
// ---------------------------------------------------------------------------

export type FilaCatalogo = {
  id: string;
  nombre: string;
  prendaId: string | null;
  prenda: string | null;
  talla: string | null;
  color: string | null;
  precioVenta: number;
  stock: number;
  controlaStock: boolean;
  fotoEn: Date | null;
  creadoEn: Date;
  categoria: string | null;
  promo: PromoCatalogo | null;
};

export type VarianteCatalogo = { id: string; talla: string | null; color: string | null; stock: number; precio: number; precioPromo: number | null; foto: string | null };

export type TarjetaCatalogo = {
  /** prendaId o, en productos sueltos, el id del producto. */
  clave: string;
  nombre: string;
  categoria: string | null;
  /** El precio más bajo entre las tallas y colores que quedan. */
  precio: number;
  precioPromo: number | null;
  promo: { nombre: string; etiqueta: string; termina: string | null } | null;
  /** "<productoId>?v=<versión>" de la foto que se muestra (null = sin foto). */
  foto: string | null;
  tallas: { talla: string; disponible: boolean }[];
  colores: { color: string; disponible: boolean }[];
  variantes: VarianteCatalogo[];
  unidades: number;
  nuevo: boolean;
  ultimas: boolean;
};

const TALLAS_LETRA = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];

/** S, M, L, XL… y luego los números de menor a mayor (6, 8, 10…). Lo demás al final. */
export function ordenTalla(a: string, b: string) {
  const ia = TALLAS_LETRA.indexOf(a.toUpperCase());
  const ib = TALLAS_LETRA.indexOf(b.toUpperCase());
  if (ia >= 0 && ib >= 0) return ia - ib;
  if (ia >= 0) return -1;
  if (ib >= 0) return 1;
  const na = Number(a.replace(",", "."));
  const nb = Number(b.replace(",", "."));
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  if (Number.isFinite(na)) return -1;
  if (Number.isFinite(nb)) return 1;
  return a.localeCompare(b, "es");
}

/** Días que una prenda se muestra como "Nuevo". */
export const DIAS_NUEVO = 15;
/** Con estas unidades o menos sale "Últimas unidades". */
export const UNIDADES_ULTIMAS = 2;

/**
 * Junta las filas (una por talla y color) en tarjetas, una por prenda. Las tallas o colores
 * agotados se dejan marcados como no disponibles (para el "avísame"); si no queda ninguna
 * unidad de la prenda, la tarjeta no sale.
 */
export function armarTarjetas(filas: FilaCatalogo[], hoy: string, ahora: Date = new Date()): TarjetaCatalogo[] {
  const grupos = new Map<string, FilaCatalogo[]>();
  for (const f of filas) {
    const clave = f.prendaId ?? f.id;
    const g = grupos.get(clave);
    if (g) g.push(f);
    else grupos.set(clave, [f]);
  }
  const limiteNuevo = ahora.getTime() - DIAS_NUEVO * 86_400_000;
  const tarjetas: TarjetaCatalogo[] = [];
  for (const [clave, g] of grupos) {
    const variantes: VarianteCatalogo[] = g.map((f) => ({
      id: f.id,
      talla: f.talla,
      color: f.color,
      stock: f.controlaStock ? Math.max(0, Math.floor(f.stock)) : 99,
      precio: f.precioVenta,
      precioPromo: precioConPromo(f.precioVenta, f.promo, hoy),
      // Id del producto + versión, para que el celular pida la foto nueva cuando cambia.
      foto: f.fotoEn ? `${f.id}?v=${f.fotoEn.getTime()}` : null,
    }));
    const conStock = variantes.filter((v) => v.stock > 0);
    if (!conStock.length) continue;
    const base = g[0];
    const masBarata = conStock.reduce((m, v) => ((v.precioPromo ?? v.precio) < (m.precioPromo ?? m.precio) ? v : m));
    const filaPromo = g.find((f) => f.id === masBarata.id)?.promo ?? null;

    const tallas: TarjetaCatalogo["tallas"] = [];
    const colores: TarjetaCatalogo["colores"] = [];
    for (const v of variantes) {
      if (v.talla) {
        const t = tallas.find((x) => normalizar(x.talla) === normalizar(v.talla!));
        if (t) t.disponible ||= v.stock > 0;
        else tallas.push({ talla: v.talla, disponible: v.stock > 0 });
      }
      if (v.color) {
        const c = colores.find((x) => normalizar(x.color) === normalizar(v.color!));
        if (c) c.disponible ||= v.stock > 0;
        else colores.push({ color: v.color, disponible: v.stock > 0 });
      }
    }
    tallas.sort((a, b) => ordenTalla(a.talla, b.talla));
    const unidades = conStock.reduce((s, v) => s + v.stock, 0);
    const controla = g.some((f) => f.controlaStock);
    // La foto: primero una de una talla que haya; si no, cualquiera.
    const foto = conStock.find((v) => v.foto)?.foto ?? variantes.find((v) => v.foto)?.foto ?? null;
    tarjetas.push({
      clave,
      nombre: base.prendaId ? (base.prenda ?? base.nombre) : base.nombre,
      categoria: base.categoria,
      precio: masBarata.precio,
      precioPromo: masBarata.precioPromo,
      promo:
        masBarata.precioPromo !== null && filaPromo
          ? { nombre: filaPromo.nombre, etiqueta: etiquetaPromo(masBarata.precio, masBarata.precioPromo), termina: cuentaRegresiva(filaPromo.hasta, hoy) }
          : null,
      foto,
      tallas,
      colores,
      variantes,
      unidades,
      nuevo: g.some((f) => f.creadoEn.getTime() >= limiteNuevo),
      ultimas: controla && unidades <= UNIDADES_ULTIMAS,
    });
  }
  return tarjetas;
}
