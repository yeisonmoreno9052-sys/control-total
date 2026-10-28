// Empresa de demostración: "Demo Control Total", para mostrarle el sistema a un
// comercio nuevo sin usar datos de ningún cliente.
//
// Se arma con las mismas funciones que usa la aplicación (crear producto, registrar
// compra, cobrar, cerrar caja…), así los números cuadran igual que en un cliente de
// verdad. Para que haya un mes de historia, cada día se "vive" hoy y al terminarlo se
// corren sus fechas hacia atrás.
//
// Reiniciar borra todo lo de la demo (y solo de la demo) y la vuelve a armar.
import { CondicionProducto, type MedioPago, type UnidadMedida } from "@/generated/prisma/enums";
import { diaEnBogota } from "@/lib/formato";
import { CONTRASENA_DEMO, EMPRESA_DEMO, NEGOCIOS_DEMO, USUARIOS_DEMO, type ProductoDemo } from "@/lib/demo/catalogo";
import { esquemaProducto } from "@/lib/inventario/esquemas";
import { sumarDias } from "@/lib/reportes/periodos";
import { calcularTotales, type FormaPago } from "@/lib/ventas/totales";
import { cifrarContrasena } from "./autenticacion";
import { abrirCaja, cerrarCaja, resumenDeCaja } from "./caja";
import { guardarCategoria } from "./categorias";
import { prisma } from "./cliente";
import { guardarProveedor, registrarFactura } from "./compras";
import type { Contexto } from "./contexto";
import type { ContextoEmy } from "./emy";
import { crearProducto, type Resultado } from "./inventario";
import { registrarMovimientoCaja } from "./movimientos-caja";
import { anularVenta, registrarVenta } from "./ventas";

export { CONTRASENA_DEMO, USUARIOS_DEMO };

/** Días de ventas que trae la demo (incluido hoy). */
const DIAS = 30;

// ─── Azar repetible ─────────────────────────────────────────────────────────

/** Números "al azar" que salen iguales cada vez con la misma semilla (mulberry32). */
function generador(semilla: number) {
  let a = semilla >>> 0;
  const siguiente = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    numero: siguiente,
    entero: (min: number, max: number) => min + Math.floor(siguiente() * (max - min + 1)),
    elegir: <T>(lista: T[], pesos?: number[]) => {
      if (!pesos) return lista[Math.floor(siguiente() * lista.length)];
      const total = pesos.reduce((a, b) => a + b, 0);
      let r = siguiente() * total;
      for (let i = 0; i < lista.length; i++) {
        r -= pesos[i];
        if (r <= 0) return lista[i];
      }
      return lista[lista.length - 1];
    },
  };
}

// ─── Precios ────────────────────────────────────────────────────────────────

/** Precio con el margen, redondeado hacia arriba como lo haría un comerciante. */
function precioConMargen(costo: number, margen: number) {
  const bruto = costo * (1 + margen / 100);
  const paso = bruto < 1_000 ? 50 : bruto < 20_000 ? 100 : 500;
  return Math.ceil(bruto / paso) * paso;
}

const fraccionado = (u: UnidadMedida) => u !== "UNIDAD";

/** Stock con el que arranca cada producto: alcanza para el mes, salvo algunos que quedan bajos a propósito. */
function stockInicial(p: ProductoDemo, azar: ReturnType<typeof generador>) {
  if (p.segunda) return 1;
  const rot = p.rotacion ?? 1;
  const dias = azar.numero() < 0.12 ? 30 : 100; // ~12 % termina el mes con stock bajo
  return Math.max(3, Math.ceil(rot * dias));
}

// ─── Fechas ─────────────────────────────────────────────────────────────────

/** Hora de Bogotá de un día ("2026-10-07", 9.5 = 9:30 a. m.) como fecha UTC. */
function horaBogota(dia: string, hora: number) {
  const minutos = Math.round(hora * 60);
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return new Date(`${dia}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-05:00`);
}

const aFechaDia = (dia: string) => new Date(`${dia}T00:00:00.000Z`);

// ─── Consultas para el panel ────────────────────────────────────────────────

export async function obtenerDemo(ce: ContextoEmy) {
  if (!ce?.usuarioId) return null;
  const e = await prisma.empresa.findFirst({ where: { esDemo: true }, select: { id: true, nombre: true } });
  if (!e) return null;
  const [productos, ventas, ultima] = await Promise.all([
    prisma.producto.count({ where: { empresaId: e.id } }),
    prisma.venta.count({ where: { empresaId: e.id } }),
    prisma.accionEmy.findFirst({
      where: { empresaId: e.id, accion: "REINICIAR_DEMO" },
      orderBy: { creadoEn: "desc" },
      select: { creadoEn: true },
    }),
  ]);
  return { ...e, productos, ventas, reiniciadaEn: ultima?.creadoEn ?? null };
}

// ─── Reiniciar ──────────────────────────────────────────────────────────────

let reiniciando = false;

/** Borra la demo y la vuelve a armar con un mes de historia. Tarda alrededor de un minuto. */
export async function reiniciarDemo(ce: ContextoEmy, opciones: { dias?: number; semilla?: number } = {}): Promise<Resultado> {
  if (!ce?.usuarioId) return { ok: false, error: "Solo el superadmin de EMY TELECOM puede reiniciar la demo." };
  if (reiniciando) return { ok: false, error: "La demo ya se está reiniciando. Espera un momento." };
  reiniciando = true;
  try {
    const { empresaId, negocios, admin, cajero } = await prepararEmpresa();
    await borrarDatos(empresaId);
    await armar(admin, cajero, negocios, opciones.dias ?? DIAS, opciones.semilla ?? 2026);
    await prisma.accionEmy.create({
      data: { usuarioId: ce.usuarioId, empresaId, accion: "REINICIAR_DEMO", detalle: { nombre: EMPRESA_DEMO.nombre } },
    });
    return { ok: true, id: empresaId };
  } catch (error) {
    if (error instanceof ErrorDemo) return { ok: false, error: error.message };
    throw error;
  } finally {
    reiniciando = false;
  }
}

class ErrorDemo extends Error {}

/** Crea (si no existe) la empresa demo, sus dos locales y sus usuarios, con la contraseña conocida. */
async function prepararEmpresa() {
  const hash = await cifrarContrasena(CONTRASENA_DEMO);
  return prisma.$transaction(async (tx) => {
    let empresa = await tx.empresa.findFirst({ where: { esDemo: true }, select: { id: true } });
    if (!empresa) {
      empresa = await tx.empresa.create({ data: { ...EMPRESA_DEMO, esDemo: true }, select: { id: true } });
    }
    await tx.empresa.update({
      where: { id: empresa.id },
      data: {
        ...EMPRESA_DEMO,
        estadoSuscripcion: "ACTIVA",
        activo: true,
        mensualidad: 0,
        proximoPago: null,
        logo: null,
        logoTipo: null,
      },
    });

    const negocios: { id: string; demo: (typeof NEGOCIOS_DEMO)[number] }[] = [];
    for (const n of NEGOCIOS_DEMO) {
      const existente = await tx.negocio.findFirst({ where: { empresaId: empresa.id, nombre: n.nombre }, select: { id: true } });
      const datos = {
        direccion: n.direccion,
        tipo: n.tipo,
        nit: EMPRESA_DEMO.nit,
        razonSocial: EMPRESA_DEMO.nombre,
        regimen: "No responsable de IVA",
        telefono: EMPRESA_DEMO.telefono,
        mensajeRecibo: "¡Gracias por su compra! (demostración)",
        consecutivoVenta: 0,
        consecutivoDevolucion: 0,
        margenSugerido: n.margen,
        activo: true,
      };
      const negocio = existente
        ? await tx.negocio.update({ where: { id: existente.id }, data: datos, select: { id: true } })
        : await tx.negocio.create({ data: { empresaId: empresa.id, nombre: n.nombre, ...datos }, select: { id: true } });
      negocios.push({ id: negocio.id, demo: n });
    }

    const usuarios: Record<string, string> = {};
    for (const u of USUARIOS_DEMO) {
      const existente = await tx.usuario.findUnique({ where: { usuario: u.usuario }, select: { id: true, empresaId: true } });
      if (existente && existente.empresaId !== empresa.id) {
        throw new ErrorDemo(`El usuario "${u.usuario}" ya lo usa otra empresa.`);
      }
      const datos = {
        nombre: u.nombre,
        rol: u.rol,
        hashContrasena: hash,
        activo: true,
        debeCambiarContrasena: false,
        intentosFallidos: 0,
        bloqueadoHasta: null,
      };
      const usuario = existente
        ? await tx.usuario.update({
            where: { id: existente.id },
            data: { ...datos, versionSesion: { increment: 1 } },
            select: { id: true },
          })
        : await tx.usuario.create({ data: { ...datos, empresaId: empresa.id, usuario: u.usuario }, select: { id: true } });
      usuarios[u.usuario] = usuario.id;
    }
    // Otros usuarios que alguien haya creado jugando con la demo quedan desactivados.
    await tx.usuario.updateMany({
      where: { empresaId: empresa.id, usuario: { notIn: USUARIOS_DEMO.map((u) => u.usuario) } },
      data: { activo: false, versionSesion: { increment: 1 } },
    });
    await tx.negocio.updateMany({
      where: { empresaId: empresa.id, id: { notIn: negocios.map((n) => n.id) } },
      data: { activo: false },
    });

    const empresaRow = await tx.empresa.findUniqueOrThrow({ where: { id: empresa.id }, select: { modulosActivos: true } });
    const ids = negocios.map((n) => n.id);
    const ctx = (usuarioId: string, rol: "ADMINISTRADOR" | "CAJERO", nombre: string): Contexto => ({
      usuarioId,
      nombre,
      empresaId: empresa.id,
      rol,
      negociosPermitidos: ids,
      modulosActivos: empresaRow.modulosActivos,
      versionSesion: 0,
      debeCambiarContrasena: false,
      puedeCrearProductos: false,
    });
    const [ua, uc] = USUARIOS_DEMO;
    await tx.usuarioNegocio.deleteMany({ where: { empresaId: empresa.id } });
    await tx.usuarioNegocio.createMany({
      data: ids.map((negocioId) => ({ empresaId: empresa.id, usuarioId: usuarios[uc.usuario], negocioId })),
    });
    return {
      empresaId: empresa.id,
      negocios,
      admin: ctx(usuarios[ua.usuario], "ADMINISTRADOR", ua.nombre),
      cajero: ctx(usuarios[uc.usuario], "CAJERO", uc.nombre),
    };
  });
}

/**
 * Borra todo lo que se movió en la demo. Es el único lugar del sistema donde se
 * borra de verdad, y solo toca la empresa marcada como demo.
 */
async function borrarDatos(empresaId: string) {
  await prisma.$transaction(
    async (tx) => {
      const demo = await tx.empresa.findFirst({ where: { id: empresaId, esDemo: true }, select: { id: true } });
      if (!demo) throw new ErrorDemo("Esa empresa no es la demo.");
      const w = { empresaId };
      await tx.detalleDevolucion.deleteMany({ where: w });
      await tx.devolucion.deleteMany({ where: w });
      await tx.pagoVenta.deleteMany({ where: w });
      await tx.detalleVenta.deleteMany({ where: w });
      await tx.venta.deleteMany({ where: w });
      await tx.abonoFactura.deleteMany({ where: w });
      await tx.adjuntoFactura.deleteMany({ where: w });
      await tx.lecturaFactura.deleteMany({ where: w });
      await tx.detalleFacturaCompra.deleteMany({ where: w });
      await tx.facturaCompra.deleteMany({ where: w });
      await tx.movimientoCaja.deleteMany({ where: w });
      await tx.caja.deleteMany({ where: w });
      await tx.movimientoInventario.deleteMany({ where: w });
      await tx.auditoria.deleteMany({ where: w });
      await tx.fotoProducto.deleteMany({ where: w });
      await tx.producto.deleteMany({ where: w });
      await tx.categoria.deleteMany({ where: w });
      await tx.proveedor.deleteMany({ where: w });
      await tx.cliente.deleteMany({ where: w });
    },
    { timeout: 120_000 },
  );
}

function exigirOk<T>(r: Resultado<T>, que: string): T & { ok: true } {
  if (!r.ok) throw new ErrorDemo(`No se pudo ${que}: ${r.error}`);
  return r;
}

type ProductoArmado = { id: string; demo: ProductoDemo; unidad: UnidadMedida; precio: number; stock: number };

async function armar(
  admin: Contexto,
  cajero: Contexto,
  negocios: { id: string; demo: (typeof NEGOCIOS_DEMO)[number] }[],
  dias: number,
  semilla: number,
) {
  const azar = generador(semilla);
  const hoy = diaEnBogota();
  const inicio = sumarDias(hoy, -(dias + 15));
  const catalogos = new Map<string, ProductoArmado[]>();

  // 1. Categorías, proveedores y productos, con fecha de hace un mes y medio.
  for (const { id: negocioId, demo } of negocios) {
    const marca = new Date();
    const categorias = new Map<string, string>();
    for (const nombre of demo.categorias) {
      const r = exigirOk(await guardarCategoria(admin, negocioId, { nombre, margenSugerido: null }), "crear la categoría");
      categorias.set(nombre, r.id);
    }
    for (const p of demo.proveedores) {
      exigirOk(await guardarProveedor(admin, negocioId, null, { ...p, correo: "" }), "crear el proveedor");
    }
    const productos: ProductoArmado[] = [];
    let n = 0;
    let s = 0;
    for (const p of demo.productos) {
      const unidad = p.unidad ?? "UNIDAD";
      const codigo = p.segunda ? `SEG-${String(++s).padStart(4, "0")}` : `${demo.prefijo}-${String(++n).padStart(3, "0")}`;
      const precio = precioConMargen(p.costo, p.segunda ? 60 : demo.margen);
      const stock = stockInicial(p, azar);
      const entrada = esquemaProducto.parse({
        codigo,
        codigoBarras: p.segunda ? "" : `770${String(azar.entero(1_000_000_000, 9_999_999_999))}`,
        nombre: p.nombre,
        descripcion: "",
        categoriaId: categorias.get(p.categoria) ?? "",
        costo: p.costo,
        precioVenta: precio,
        stockMinimo: p.segunda ? "0" : String(Math.max(2, Math.ceil((p.rotacion ?? 1) * 5))),
        unidad,
        fraccionado: fraccionado(unidad),
        porcentajeIva: p.iva ?? 0,
        condicion: p.segunda ? CondicionProducto.DE_SEGUNDA : CondicionProducto.NUEVO,
      });
      const r = exigirOk(await crearProducto(admin, negocioId, entrada, String(stock)), `crear "${p.nombre}"`);
      productos.push({ id: r.id, demo: p, unidad, precio, stock });
    }
    catalogos.set(negocioId, productos);
    await correrFechas(admin.empresaId, negocioId, marca, inicio, 9);
  }

  // 2. Compras: una de contado, una a crédito por pagar y una a crédito ya vencida.
  for (const { id: negocioId } of negocios) {
    const productos = catalogos.get(negocioId)!;
    const proveedores = await prisma.proveedor.findMany({
      where: { negocioId },
      orderBy: { nombre: "asc" },
      select: { id: true },
    });
    const compras = [
      {
        dias: -(dias - 2),
        pago: { tipo: "contado" as const, medio: "TRANSFERENCIA" as MedioPago, desdeCaja: false },
        vence: null,
      },
      { dias: -(dias - 5), pago: { tipo: "credito" as const }, vence: -3 },
      { dias: -12, pago: { tipo: "credito" as const }, vence: 18 },
    ];
    for (const [i, c] of compras.entries()) {
      const desfase = Math.min(0, Math.max(c.dias, -(dias - 1)));
      const fecha = sumarDias(hoy, desfase);
      const marca = new Date();
      const elegidos = productos.filter((p) => !p.demo.segunda && azar.numero() < 0.15).slice(0, 12);
      const lineas = elegidos.map((p) => ({
        productoId: p.id,
        cantidad: String(Math.max(2, Math.ceil((p.demo.rotacion ?? 1) * 6))),
        costoUnitario: p.demo.costo,
        precioVenta: null,
      }));
      if (!lineas.length) continue;
      exigirOk(
        await registrarFactura(admin, negocioId, {
          proveedorId: proveedores[i % proveedores.length].id,
          numero: `FV-${azar.entero(10_000, 99_999)}`,
          fecha,
          vencimiento: c.vence === null ? null : sumarDias(hoy, Math.max(desfase, c.vence)),
          lineas,
          pago: c.pago,
        }),
        "registrar la compra",
      );
      for (const l of lineas) {
        const p = productos.find((x) => x.id === l.productoId)!;
        p.stock += Number(l.cantidad);
      }
      await correrFechas(admin.empresaId, negocioId, marca, fecha, 10);
    }
  }

  // 3. Un mes de ventas, día por día, con su caja.
  for (let d = dias - 1; d >= 0; d--) {
    const dia = sumarDias(hoy, -d);
    const semana = new Date(`${dia}T12:00:00Z`).getUTCDay(); // 0 = domingo
    for (const { id: negocioId, demo } of negocios) {
      // La ferretería no abre el domingo (pero hoy siempre queda abierta para mostrarla).
      if (semana === 0 && demo.prefijo === "FER" && d > 0) continue;
      const marca = new Date();
      const caja = exigirOk(await abrirCaja(cajero, negocioId, demo.prefijo === "MOT" ? 100_000 : 150_000), "abrir la caja");
      const productos = catalogos.get(negocioId)!;
      const factor = semana === 0 ? 0.4 : semana === 6 ? 1.3 : 1;
      const cuantas = Math.max(2, Math.round((demo.prefijo === "MOT" ? 22 : 42) * factor * (0.7 + azar.numero() * 0.6)));
      // Hoy va a mitad de jornada: menos ventas y la caja queda abierta para seguir vendiendo.
      const ventasDelDia = d === 0 ? Math.ceil(cuantas / 2) : cuantas;
      const hechas: string[] = [];
      for (let v = 0; v < ventasDelDia; v++) {
        const id = await vender(cajero, negocioId, productos, azar);
        if (id) hechas.push(id);
      }
      // De vez en cuando se anula una venta (cliente se arrepintió, se cobró mal…).
      if (hechas.length > 3 && azar.numero() < 0.2) {
        exigirOk(
          await anularVenta(
            cajero,
            azar.elegir(hechas),
            azar.elegir(["Se cobró dos veces", "El cliente se arrepintió", "Producto equivocado"]),
          ),
          "anular",
        );
      }
      await gastosDelDia(admin, negocioId, demo.prefijo, dia, azar);
      if (d === 0) continue;

      const resumen = await prisma.$transaction((tx) => resumenDeCaja(tx, admin, caja.id));
      const diferencia = azar.numero() < 0.15 ? azar.elegir([-2_000, -1_000, 500, 1_000, -5_000]) : 0;
      exigirOk(await cerrarCaja(cajero, caja.id, Math.max(0, (resumen?.esperado ?? 0) + diferencia), null), "cerrar la caja");
      await moverDia(admin.empresaId, negocioId, caja.id, marca, dia);
    }
  }
}

/** Una venta de 1 a 3 productos, pagada como pagan los clientes de verdad. */
async function vender(cajero: Contexto, negocioId: string, productos: ProductoArmado[], azar: ReturnType<typeof generador>) {
  const disponibles = productos.filter((p) => p.stock > 0);
  if (!disponibles.length) return null;
  const pesos = disponibles.map((p) => p.demo.rotacion ?? 1);
  const cuantos = azar.elegir([1, 1, 2, 2, 3, 4]);
  const lineas: { productoId: string; cantidad: string; descuento?: { tipo: "porcentaje"; valor: number } | null }[] = [];
  const calculo: {
    precioUnitario: number;
    cantidad: string;
    porcentajeIva: number;
    descuento?: { tipo: "porcentaje"; valor: number } | null;
  }[] = [];
  for (let i = 0; i < cuantos; i++) {
    const p = azar.elegir(disponibles, pesos);
    if (lineas.some((l) => l.productoId === p.id)) continue;
    const cantidad = cantidadVendida(p, azar);
    if (cantidad <= 0 || cantidad > p.stock) continue;
    const descuento = azar.numero() < 0.07 ? { tipo: "porcentaje" as const, valor: azar.elegir([5, 10]) } : null;
    const texto = String(cantidad);
    lineas.push({ productoId: p.id, cantidad: texto, descuento });
    calculo.push({ precioUnitario: p.precio, cantidad: texto, porcentajeIva: p.demo.iva ?? 0, descuento });
  }
  if (!lineas.length) return null;
  const { total } = calcularTotales(calculo);
  const r = azar.numero();
  let pago: FormaPago;
  if (r < 0.62) {
    const billete =
      total <= 20_000
        ? azar.elegir([total, Math.ceil(total / 10_000) * 10_000, 20_000])
        : azar.elegir([total, Math.ceil(total / 50_000) * 50_000]);
    pago = { forma: "efectivo", recibido: Math.max(total, billete) };
  } else if (r < 0.95 || total < 4_000) {
    pago = { forma: "transferencia", referencia: azar.elegir(["Nequi", "Bancolombia", "Daviplata", null]) };
  } else {
    const transferencia = Math.round(total / 2 / 100) * 100 || 100;
    pago = { forma: "mixto", transferencia, recibido: total - transferencia, referencia: "Nequi" };
  }
  const v = await registrarVenta(cajero, negocioId, { lineas, pago, totalEsperado: total });
  if (!v.ok) return null;
  for (const l of lineas) {
    const p = productos.find((x) => x.id === l.productoId)!;
    p.stock = Math.round((p.stock - Number(l.cantidad)) * 1000) / 1000;
  }
  return v.id;
}

function cantidadVendida(p: ProductoArmado, azar: ReturnType<typeof generador>) {
  if (p.demo.segunda) return 1;
  if (p.unidad === "METRO") return azar.elegir([1, 2, 3, 5, 10, 2.5, 1.5]);
  if (p.unidad === "KILO") return azar.elegir([0.5, 1, 2, 0.25, 1.5, 5]);
  if (p.unidad === "GALON" || p.unidad === "LITRO") return azar.elegir([1, 1, 2, 0.5]);
  if ((p.demo.rotacion ?? 1) >= 10) return azar.elegir([4, 6, 10, 12, 20, 25, 50]); // tornillos, chazos…
  return azar.elegir([1, 1, 1, 2]);
}

/** Nómina cada quincena, arriendo y servicios al mes, y algún transporte. */
async function gastosDelDia(
  admin: Contexto,
  negocioId: string,
  prefijo: string,
  dia: string,
  azar: ReturnType<typeof generador>,
) {
  const n = Number(dia.slice(8, 10));
  const gastos: { categoria: "NOMINA" | "ARRIENDO" | "SERVICIOS" | "TRANSPORTE"; valor: number; pagadoA: string }[] = [];
  if (n === 15 || n === 30) {
    gastos.push({ categoria: "NOMINA", valor: prefijo === "MOT" ? 1_200_000 : 1_000_000, pagadoA: "Quincena empleados" });
  }
  if (n === 5) gastos.push({ categoria: "ARRIENDO", valor: prefijo === "MOT" ? 1_500_000 : 1_300_000, pagadoA: "Inmobiliaria" });
  if (n === 10) gastos.push({ categoria: "SERVICIOS", valor: azar.entero(180, 260) * 1_000, pagadoA: "EPM" });
  if (azar.numero() < 0.08) gastos.push({ categoria: "TRANSPORTE", valor: azar.entero(15, 45) * 1_000, pagadoA: "Domicilio" });
  for (const g of gastos) {
    exigirOk(
      await registrarMovimientoCaja(admin, negocioId, { ...g, medio: "TRANSFERENCIA", fecha: dia, desdeCaja: false }),
      "registrar el gasto",
    );
  }
}

/** Lo creado desde `marca` en este negocio pasa al día indicado (a media mañana). */
async function correrFechas(empresaId: string, negocioId: string, marca: Date, dia: string, hora: number) {
  const fecha = horaBogota(dia, hora);
  const w = { empresaId, negocioId, creadoEn: { gte: marca } };
  await prisma.$transaction([
    prisma.producto.updateMany({ where: w, data: { creadoEn: fecha, actualizadoEn: fecha } }),
    prisma.categoria.updateMany({ where: w, data: { creadoEn: fecha } }),
    prisma.proveedor.updateMany({ where: w, data: { creadoEn: fecha } }),
    prisma.movimientoInventario.updateMany({ where: w, data: { creadoEn: fecha } }),
    prisma.facturaCompra.updateMany({ where: w, data: { creadoEn: fecha } }),
    prisma.abonoFactura.updateMany({ where: w, data: { creadoEn: fecha } }),
    prisma.auditoria.updateMany({ where: w, data: { creadoEn: fecha } }),
  ]);
}

/**
 * Pasa una jornada que se acaba de "vivir" hoy a su día real: la caja, sus ventas
 * (repartidas de 8 a. m. a 7 p. m.) y todo lo que se movió con ellas.
 */
async function moverDia(empresaId: string, negocioId: string, cajaId: string, marca: Date, dia: string) {
  const ventas = await prisma.venta.findMany({
    where: { cajaId },
    orderBy: { consecutivo: "asc" },
    select: { id: true, anuladaEn: true },
  });
  const paso = 10.5 / Math.max(ventas.length, 1);
  const cambios = ventas.map((v, i) => {
    const hora = horaBogota(dia, 8.25 + i * paso);
    return prisma.venta.update({
      where: { id: v.id },
      data: { creadoEn: hora, ...(v.anuladaEn ? { anuladaEn: new Date(hora.getTime() + 12 * 60_000) } : {}) },
    });
  });
  const w = { empresaId, negocioId, creadoEn: { gte: marca } };
  await prisma.$transaction([
    ...cambios,
    prisma.caja.update({
      where: { id: cajaId },
      data: { fecha: aFechaDia(dia), abiertaEn: horaBogota(dia, 7.75), cerradaEn: horaBogota(dia, 19.25) },
    }),
    prisma.movimientoInventario.updateMany({ where: w, data: { creadoEn: horaBogota(dia, 13) } }),
    prisma.auditoria.updateMany({ where: w, data: { creadoEn: horaBogota(dia, 13) } }),
    prisma.movimientoCaja.updateMany({ where: w, data: { creadoEn: horaBogota(dia, 17) } }),
  ]);
}
