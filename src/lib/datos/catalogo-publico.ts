// Catálogo en línea: lo que ve cualquier persona con el link, sin iniciar sesión.
//
// Esta es la ÚNICA parte de la app que lee la base sin un usuario. Por eso:
//   - todo entra por el link (slug) de un negocio con el catálogo prendido, de una empresa
//     activa y al día; si no, es como si no existiera;
//   - solo se leen los campos que el cliente puede ver (nombre, precio, tallas, foto). Nunca
//     costos, ventas, proveedores ni nada de otro negocio;
//   - lo único que se escribe son los avisos de talla y el conteo de vistas y pedidos.
import { z } from "zod";
import { armarTarjetas, numeroWhatsapp, type FilaCatalogo, type TarjetaCatalogo } from "@/lib/catalogo/catalogo";
import { diaEnBogota, fechaDeHoy } from "@/lib/formato";
import { esPaleta, PALETA_POR_DEFECTO, type Paleta } from "@/lib/paletas";
import { paraBuscar } from "@/lib/texto";
import { prisma } from "./cliente";

export type TiendaPublica = {
  negocioId: string;
  empresaId: string;
  slug: string;
  nombre: string;
  direccion: string | null;
  whatsapp: string | null;
  mostrarCantidad: boolean;
  logoUrl: string | null;
  /** Poner el logo pequeño sobre las fotos (solo si la empresa tiene logo). */
  marcaAgua: boolean;
  paleta: Paleta;
};

/** La tienda de un link, o null si el catálogo no está disponible. */
export async function buscarTienda(slugCrudo: string): Promise<TiendaPublica | null> {
  const slug = String(slugCrudo ?? "").toLowerCase().slice(0, 40);
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return null;
  const n = await prisma.negocio.findFirst({
    where: { catalogoSlug: slug, catalogoActivo: true, activo: true },
    select: {
      id: true,
      empresaId: true,
      nombre: true,
      direccion: true,
      telefono: true,
      catalogoWhatsapp: true,
      catalogoMostrarCantidad: true,
      catalogoMarcaAgua: true,
      empresa: { select: { activo: true, estadoSuscripcion: true, pruebaHasta: true, logoTipo: true, actualizadoEn: true, paleta: true, modulosActivos: true } },
    },
  });
  if (!n) return null;
  const e = n.empresa;
  if (!e.activo || e.estadoSuscripcion !== "ACTIVA") return null;
  if (e.pruebaHasta && e.pruebaHasta <= new Date()) return null;
  if (!e.modulosActivos.includes("INVENTARIO")) return null;
  return {
    negocioId: n.id,
    empresaId: n.empresaId,
    slug,
    nombre: n.nombre,
    direccion: n.direccion,
    whatsapp: numeroWhatsapp(n.catalogoWhatsapp) ?? numeroWhatsapp(n.telefono),
    mostrarCantidad: n.catalogoMostrarCantidad,
    logoUrl: e.logoTipo ? `/c/${slug}/logo?v=${e.actualizadoEn.getTime()}` : null,
    marcaAgua: n.catalogoMarcaAgua && !!e.logoTipo,
    paleta: esPaleta(e.paleta) ? e.paleta : PALETA_POR_DEFECTO,
  };
}

/** Lo que se muestra de cada producto. Sin costo, sin código de barras, sin proveedor. */
const camposPublicos = {
  id: true,
  nombre: true,
  prendaId: true,
  prenda: true,
  talla: true,
  color: true,
  precioVenta: true,
  stock: true,
  controlaStock: true,
  fotoEn: true,
  creadoEn: true,
  categoria: { select: { nombre: true } },
  promocion: { select: { nombre: true, tipo: true, valor: true, desde: true, hasta: true, activa: true } },
} as const;

type FilaDb = {
  id: string;
  nombre: string;
  prendaId: string | null;
  prenda: string | null;
  talla: string | null;
  color: string | null;
  precioVenta: number;
  stock: { toString(): string };
  controlaStock: boolean;
  fotoEn: Date | null;
  creadoEn: Date;
  categoria: { nombre: string } | null;
  promocion: { nombre: string; tipo: "PORCENTAJE" | "PRECIO"; valor: number; desde: Date; hasta: Date; activa: boolean } | null;
};

const aDia = (d: Date) => d.toISOString().slice(0, 10);

function aFila(f: FilaDb): FilaCatalogo {
  const p = f.promocion;
  return {
    id: f.id,
    nombre: f.nombre,
    prendaId: f.prendaId,
    prenda: f.prenda,
    talla: f.talla,
    color: f.color,
    precioVenta: f.precioVenta,
    stock: Number(f.stock.toString()),
    controlaStock: f.controlaStock,
    fotoEn: f.fotoEn,
    creadoEn: f.creadoEn,
    categoria: f.categoria?.nombre ?? null,
    promo: p && p.activa ? { nombre: p.nombre, tipo: p.tipo, valor: p.valor, desde: aDia(p.desde), hasta: aDia(p.hasta) } : null,
  };
}

export const FILTROS = ["nuevo", "promo", "ultimas"] as const;
export type FiltroCatalogo = (typeof FILTROS)[number];

export type ConsultaCatalogo = {
  q?: string;
  /** Nombre exacto de la categoría ("Mujer - Jeans") o el grupo ("Mujer"). */
  categoria?: string;
  filtro?: FiltroCatalogo;
  pagina?: number;
};

export const POR_PAGINA = 24;

/** Productos que se pueden mostrar: activos, con precio y con algo para vender. */
const vendible = (negocioId: string) => ({
  negocioId,
  activo: true,
  precioVenta: { gt: 0 },
  OR: [{ stock: { gt: 0 } }, { controlaStock: false }],
});

/**
 * Las tarjetas de una página del catálogo. Primero se buscan solo las claves (prenda o producto)
 * que cumplen, en orden de lo más nuevo; luego se traen completas solo las de esa página.
 */
export async function listarCatalogo(tienda: TiendaPublica, consulta: ConsultaCatalogo) {
  const hoy = diaEnBogota();
  const palabras = paraBuscar(String(consulta.q ?? "").trim().slice(0, 80))
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);
  const cat = String(consulta.categoria ?? "").slice(0, 100);
  const dondeCategoria = cat
    ? { categoria: { OR: [{ nombre: cat }, { nombre: { startsWith: `${cat} - ` } }] } }
    : {};
  const dondePromo =
    consulta.filtro === "promo"
      ? { promocion: { activa: true, desde: { lte: fechaDeHoy() }, hasta: { gte: fechaDeHoy() } } }
      : {};

  const ligeras = await prisma.producto.findMany({
    where: {
      ...vendible(tienda.negocioId),
      ...dondeCategoria,
      ...dondePromo,
      ...(palabras.length ? { AND: palabras.map((p) => ({ nombreBusqueda: { contains: p } })) } : {}),
    },
    select: { id: true, prendaId: true },
    orderBy: [{ creadoEn: "desc" }, { id: "asc" }],
    take: 20_000,
  });
  const claves: string[] = [];
  const vistas = new Set<string>();
  for (const l of ligeras) {
    const c = l.prendaId ?? l.id;
    if (!vistas.has(c)) {
      vistas.add(c);
      claves.push(c);
    }
  }

  // "Nuevo" y "Últimas" dependen de la prenda completa: se arman todas y se filtran
  // (son pocas tarjetas por tienda). Sin esos filtros se pagina antes de armar.
  const filtraArmadas = consulta.filtro === "nuevo" || consulta.filtro === "ultimas";
  const pagina = Math.max(1, Math.min(500, Math.floor(Number(consulta.pagina) || 1)));
  const clavesPagina = filtraArmadas ? claves : claves.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  let tarjetas = await tarjetasDe(tienda.negocioId, clavesPagina, hoy);
  let total = claves.length;
  if (filtraArmadas) {
    tarjetas = tarjetas.filter((t) => (consulta.filtro === "nuevo" ? t.nuevo : t.ultimas));
    total = tarjetas.length;
    tarjetas = tarjetas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  }
  return { tarjetas, total, pagina, paginas: Math.max(1, Math.ceil(total / POR_PAGINA)) };
}

/** Tarjetas completas (con las tallas agotadas) de unas claves, en el mismo orden. */
async function tarjetasDe(negocioId: string, claves: string[], hoy: string) {
  if (!claves.length) return [];
  const filas = await prisma.producto.findMany({
    where: { negocioId, activo: true, precioVenta: { gt: 0 }, OR: [{ prendaId: { in: claves } }, { id: { in: claves }, prendaId: null }] },
    select: camposPublicos,
    orderBy: [{ creadoEn: "asc" }, { id: "asc" }],
  });
  const fotos = await prisma.fotoCatalogo.findMany({
    where: { negocioId, clave: { in: claves } },
    select: { id: true, clave: true, color: true },
    orderBy: [{ orden: "asc" }, { creadoEn: "asc" }],
  });
  const extras = new Map<string, { id: string; color: string | null }[]>();
  for (const f of fotos) extras.set(f.clave, [...(extras.get(f.clave) ?? []), { id: f.id, color: f.color }]);
  const tarjetas = armarTarjetas(filas.map(aFila), hoy, new Date(), extras);
  const orden = new Map(claves.map((c, i) => [c, i]));
  return tarjetas.sort((a, b) => (orden.get(a.clave) ?? 0) - (orden.get(b.clave) ?? 0));
}

/** Una prenda (o producto suelto) del catálogo, o null si no es de esta tienda o ya no hay. */
export async function obtenerTarjeta(tienda: TiendaPublica, claveCruda: string): Promise<TarjetaCatalogo | null> {
  const clave = String(claveCruda ?? "").slice(0, 40);
  if (!clave) return null;
  const [t] = await tarjetasDe(tienda.negocioId, [clave], diaEnBogota());
  return t ?? null;
}

/** Otras prendas de la misma categoría para "También te puede gustar". */
export async function parecidas(tienda: TiendaPublica, tarjeta: TarjetaCatalogo, cuantas = 6) {
  if (!tarjeta.categoria) return [];
  const r = await listarCatalogo(tienda, { categoria: tarjeta.categoria });
  return r.tarjetas.filter((t) => t.clave !== tarjeta.clave).slice(0, cuantas);
}

/** Categorías con algo para vender, para los filtros. */
export async function categoriasCatalogo(tienda: TiendaPublica) {
  const grupos = await prisma.producto.groupBy({
    by: ["categoriaId"],
    where: { ...vendible(tienda.negocioId), categoriaId: { not: null } },
  });
  const ids = grupos.map((g) => g.categoriaId!).filter(Boolean);
  if (!ids.length) return [];
  const cats = await prisma.categoria.findMany({
    where: { id: { in: ids }, negocioId: tienda.negocioId, activo: true },
    select: { nombre: true },
    orderBy: { nombre: "asc" },
  });
  return cats.map((c) => c.nombre);
}

/** ¿Hay algo en promoción hoy? (para mostrar el filtro "Promociones"). */
export async function hayPromociones(tienda: TiendaPublica) {
  const n = await prisma.producto.count({
    where: { ...vendible(tienda.negocioId), promocion: { activa: true, desde: { lte: fechaDeHoy() }, hasta: { gte: fechaDeHoy() } } },
  });
  return n > 0;
}

/** Foto de un producto, solo si es de esta tienda y está activo. */
export async function fotoPublica(tienda: TiendaPublica, productoId: string) {
  const foto = await prisma.fotoProducto.findFirst({
    where: { productoId: String(productoId).slice(0, 40), negocioId: tienda.negocioId, producto: { activo: true } },
    select: { datos: true, tipo: true },
  });
  return foto ? { bytes: foto.datos, tipo: foto.tipo } : null;
}

/** Foto extra de una prenda, solo si es de esta tienda y la prenda sigue activa. */
export async function fotoCatalogoPublica(tienda: TiendaPublica, fotoId: string) {
  const foto = await prisma.fotoCatalogo.findFirst({
    where: { id: String(fotoId).slice(0, 40), negocioId: tienda.negocioId },
    select: { datos: true, tipo: true, clave: true },
  });
  if (!foto) return null;
  const activa = await prisma.producto.count({
    where: { negocioId: tienda.negocioId, activo: true, OR: [{ prendaId: foto.clave }, { id: foto.clave, prendaId: null }] },
  });
  return activa ? { bytes: foto.datos, tipo: foto.tipo } : null;
}

export async function logoPublico(tienda: TiendaPublica) {
  const e = await prisma.empresa.findUnique({ where: { id: tienda.empresaId }, select: { logo: true, logoTipo: true } });
  return e?.logo && e.logoTipo ? { bytes: e.logo, tipo: e.logoTipo } : null;
}

/** Nombre de la prenda o producto de una clave, si es de esta tienda. */
async function nombreDeClave(negocioId: string, clave: string) {
  const p = await prisma.producto.findFirst({
    where: { negocioId, activo: true, OR: [{ prendaId: clave }, { id: clave, prendaId: null }] },
    select: { nombre: true, prenda: true, prendaId: true },
  });
  return p ? (p.prendaId ? (p.prenda ?? p.nombre) : p.nombre) : null;
}

/** Suma una vista o un pedido por WhatsApp a la prenda, en el día de hoy. */
export async function registrarEvento(tienda: TiendaPublica, claveCruda: string, tipo: "vista" | "pedido") {
  const clave = String(claveCruda ?? "").slice(0, 40);
  if (!clave) return false;
  const nombre = await nombreDeClave(tienda.negocioId, clave);
  if (!nombre) return false;
  const dia = fechaDeHoy();
  const campo = tipo === "vista" ? "vistas" : "pedidos";
  await prisma.vistaCatalogo.upsert({
    where: { negocioId_clave_dia: { negocioId: tienda.negocioId, clave, dia } },
    create: { empresaId: tienda.empresaId, negocioId: tienda.negocioId, clave, nombre: nombre.slice(0, 120), dia, [campo]: 1 },
    update: { [campo]: { increment: 1 }, nombre: nombre.slice(0, 120) },
  });
  return true;
}

export const esquemaAviso = z.object({
  clave: z.string().trim().min(1).max(40),
  talla: z.string().trim().max(20).optional().nullable(),
  color: z.string().trim().max(40).optional().nullable(),
  cliente: z.string().trim().max(60).optional().nullable(),
  telefono: z.string().trim().min(7, "Escribe tu número de WhatsApp.").max(20, "Revisa el número."),
});

/** Máximo de avisos pendientes por número en una tienda (para que nadie llene la lista). */
const MAX_AVISOS_POR_NUMERO = 10;

/** "Avísame cuando llegue mi talla". */
export async function crearAviso(tienda: TiendaPublica, entrada: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = esquemaAviso.safeParse(entrada);
  if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? "Revisa los datos." };
  const a = r.data;
  const telefono = numeroWhatsapp(a.telefono);
  if (!telefono) return { ok: false, error: "Ese número no parece un celular. Escríbelo así: 300 123 4567." };
  const p = await prisma.producto.findFirst({
    where: { negocioId: tienda.negocioId, activo: true, OR: [{ prendaId: a.clave }, { id: a.clave, prendaId: null }] },
    select: { id: true, nombre: true, prenda: true, prendaId: true },
  });
  if (!p) return { ok: false, error: "Esa prenda ya no está en el catálogo." };
  const talla = a.talla || null;
  const color = a.color || null;
  const pendientes = await prisma.avisoTalla.findMany({
    where: { negocioId: tienda.negocioId, telefono, avisadoEn: null },
    select: { prendaId: true, productoId: true, talla: true, color: true },
  });
  const repetido = pendientes.some(
    (x) => (x.prendaId ?? x.productoId) === (p.prendaId ?? p.id) && (x.talla ?? null) === talla && (x.color ?? null) === color,
  );
  if (repetido) return { ok: true };
  if (pendientes.length >= MAX_AVISOS_POR_NUMERO) return { ok: false, error: "Ya tienes muchos avisos pendientes. Escríbenos por WhatsApp." };
  await prisma.avisoTalla.create({
    data: {
      empresaId: tienda.empresaId,
      negocioId: tienda.negocioId,
      prendaId: p.prendaId,
      productoId: p.prendaId ? null : p.id,
      nombre: (p.prendaId ? (p.prenda ?? p.nombre) : p.nombre).slice(0, 120),
      talla,
      color,
      cliente: a.cliente || null,
      telefono,
    },
  });
  return { ok: true };
}
