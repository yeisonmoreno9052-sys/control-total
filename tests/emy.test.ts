// Panel de EMY TELECOM: solo el superadmin entra, crea clientes aislados, los
// suspende (y con eso no pueden ingresar) y la demo se reinicia sin tocar a nadie más.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { cifrarContrasena, verificarCredenciales } from "@/lib/datos/autenticacion";
import { prisma } from "@/lib/datos/cliente";
import { cargarContexto } from "@/lib/datos/contexto";
import { obtenerDemo, reiniciarDemo } from "@/lib/datos/demo";
import { obtenerEmpresa } from "@/lib/datos/empresa";
import {
  cambiarEstadoCliente,
  cambiarPaleta,
  cargarSuperadmin,
  contrasenaTemporal,
  crearCliente,
  estadoPago,
  listarClientes,
  registrarPagoCliente,
  restablecerContrasenaCliente,
  type ContextoEmy,
} from "@/lib/datos/emy";
import { buscarProductos } from "@/lib/datos/productos";
import { crearEscenario, type Escenario } from "./escenario";

let e: Escenario;
let ce: ContextoEmy;
beforeEach(async () => {
  e = await crearEscenario();
  const u = await prisma.usuario.create({ data: { usuario: "emy", nombre: "Yeison", rol: "SUPERADMIN", hashContrasena: "x" } });
  ce = (await cargarSuperadmin(u.id))!;
});
afterAll(() => prisma.$disconnect());

const nuevo = (extra: Record<string, unknown> = {}) => ({
  nombre: "Droguería La 80",
  nit: "901234567-1",
  telefono: "3001234567",
  correo: "",
  direccion: "",
  mensualidad: "120000",
  proximoPago: "",
  notasEmy: "",
  locales: [{ nombre: "Principal", direccion: "Cra 80 # 30-10", tipo: "Droguería" }],
  adminNombre: "Ana Gómez",
  adminUsuario: "ana.la80",
  ...extra,
});

describe("quién entra al panel", () => {
  it("solo un SUPERADMIN sin empresa", async () => {
    expect(ce).toMatchObject({ nombre: "Yeison" });
    expect(await cargarSuperadmin(e.ctx.admin.usuarioId)).toBeNull();
    const conEmpresa = await prisma.usuario.create({
      data: { empresaId: e.camila.id, usuario: "falso", nombre: "x", rol: "SUPERADMIN", hashContrasena: "x" },
    });
    expect(await cargarSuperadmin(conEmpresa.id)).toBeNull();
    await expect(listarClientes(null as unknown as ContextoEmy)).rejects.toThrow();
  });

  it("el superadmin no tiene contexto de empresa: no ve productos ni ventas de nadie", async () => {
    expect(await cargarContexto(ce.usuarioId)).toBeNull();
  });
});

describe("clientes", () => {
  it("crea la empresa con su local y su administrador, con contraseña temporal", async () => {
    const r = await crearCliente(ce, nuevo());
    if (!r.ok) throw new Error(r.error);
    const ctx = await cargarContexto((await prisma.usuario.findUniqueOrThrow({ where: { usuario: "ana.la80" } })).id);
    expect(ctx).toMatchObject({ empresaId: r.id, rol: "ADMINISTRADOR", debeCambiarContrasena: true });
    expect((await verificarCredenciales("ana.la80", r.contrasena)).ok).toBe(true);
    // No ve nada de Camila.
    await prisma.producto.create({
      data: { empresaId: e.camila.id, negocioId: e.motos.id, codigo: "M-1", nombre: "Llanta", costo: 1, precioVenta: 2 },
    });
    const productos = await buscarProductos(ctx!, e.motos.id, {} as never).catch(() => ({ total: 0 }));
    expect(productos.total).toBe(0);
    const fila = (await listarClientes(ce)).find((c) => c.id === r.id)!;
    expect(fila).toMatchObject({ locales: 1, usuarios: 1, mensualidad: 120_000, activa: true });
    expect(await prisma.accionEmy.count({ where: { empresaId: r.id, accion: "CREAR_CLIENTE" } })).toBe(1);
  });

  it("no repite usuarios de otra empresa", async () => {
    const r = await crearCliente(ce, nuevo({ adminUsuario: "admin" }));
    expect(r.ok).toBe(false);
  });

  it("suspender corta el ingreso y las sesiones; reactivar lo devuelve", async () => {
    const hashContrasena = await cifrarContrasena("Clave-12345");
    await prisma.usuario.update({ where: { id: e.ctx.admin.usuarioId }, data: { hashContrasena } });
    expect((await cambiarEstadoCliente(ce, e.camila.id, false)).ok).toBe(true);
    expect(await verificarCredenciales("admin", "Clave-12345")).toMatchObject({ ok: false, motivo: "suspendida" });
    expect(await cargarContexto(e.ctx.admin.usuarioId)).toBeNull();
    // La otra empresa sigue normal.
    expect(await cargarContexto(e.ctx.adminOtra.usuarioId)).not.toBeNull();
    expect((await cambiarEstadoCliente(ce, e.camila.id, true)).ok).toBe(true);
    expect((await verificarCredenciales("admin", "Clave-12345")).ok).toBe(true);
  });

  it("registrar el pago corre la fecha un mes", async () => {
    await prisma.empresa.update({ where: { id: e.camila.id }, data: { proximoPago: new Date("2026-10-05T00:00:00Z") } });
    const r = await registrarPagoCliente(ce, e.camila.id, new Date("2026-10-11T00:00:00Z"));
    if (!r.ok) throw new Error(r.error);
    expect(r.proximoPago.toISOString().slice(0, 10)).toBe("2026-11-05");
  });

  it("estado del pago", () => {
    const hoy = new Date("2026-10-11T00:00:00Z");
    expect(estadoPago(null, hoy)).toBe("sin_fecha");
    expect(estadoPago(new Date("2026-10-10T00:00:00Z"), hoy)).toBe("vencido");
    expect(estadoPago(new Date("2026-10-14T00:00:00Z"), hoy)).toBe("vence_pronto");
    expect(estadoPago(new Date("2026-11-01T00:00:00Z"), hoy)).toBe("al_dia");
  });

  it("restablece la contraseña solo de usuarios de esa empresa", async () => {
    const mal = await restablecerContrasenaCliente(ce, e.otra.id, e.ctx.admin.usuarioId);
    expect(mal.ok).toBe(false);
    const r = await restablecerContrasenaCliente(ce, e.camila.id, e.ctx.admin.usuarioId);
    if (!r.ok) throw new Error(r.error);
    expect((await verificarCredenciales("admin", r.contrasena)).ok).toBe(true);
    expect(contrasenaTemporal()).toMatch(/^[a-z]{4}-\d{4}-[a-z]{4}$/);
  });
});

describe("colores de cada cliente", () => {
  it("cada empresa tiene su paleta y cambiarla no toca a las demás", async () => {
    expect((await obtenerEmpresa(e.ctx.admin))?.paleta).toBe("indigo");
    expect(await cambiarPaleta(ce, e.otra.id, "cafe")).toMatchObject({ ok: true });
    expect((await obtenerEmpresa(e.ctx.adminOtra))?.paleta).toBe("cafe");
    expect((await obtenerEmpresa(e.ctx.admin))?.paleta).toBe("indigo");
    expect(await prisma.accionEmy.count({ where: { empresaId: e.otra.id, accion: "CAMBIAR_PALETA" } })).toBe(1);
  });

  it("solo acepta paletas de la lista, y solo desde el panel", async () => {
    expect(await cambiarPaleta(ce, e.camila.id, "rosado")).toMatchObject({ ok: false });
    expect(await cambiarPaleta(ce, e.camila.id, "red; background:url(x)")).toMatchObject({ ok: false });
    // Sin superadmin (cargarSuperadmin da null a cualquier otro usuario) no pasa.
    await expect(cambiarPaleta(null as never, e.camila.id, "cafe")).rejects.toThrow();
    expect((await obtenerEmpresa(e.ctx.admin))?.paleta).toBe("indigo");
  });
});

describe("demo", () => {
  it("se arma con historia, cuadra y no toca a otras empresas", async () => {
    const antes = await prisma.producto.count({ where: { empresaId: { not: undefined } } });
    const r = await reiniciarDemo(ce, { dias: 4, semilla: 7 });
    if (!r.ok) throw new Error(r.error);
    const demo = (await obtenerDemo(ce))!;
    expect(demo.productos).toBeGreaterThan(100);
    expect(demo.ventas).toBeGreaterThan(10);
    expect((await verificarCredenciales("demo", "demo2026")).ok).toBe(true);
    // Cajas de días pasados cerradas; la de hoy abierta.
    const cajas = await prisma.caja.findMany({ where: { empresaId: r.id }, orderBy: { fecha: "asc" } });
    expect(cajas.filter((c) => !c.cerradaEn)).toHaveLength(2);
    expect(new Set(cajas.map((c) => c.fecha.toISOString())).size).toBeGreaterThan(2);
    // El stock de cada producto se explica por sus movimientos.
    const productos = await prisma.producto.findMany({ where: { empresaId: r.id }, select: { id: true, stock: true } });
    const movs = await prisma.movimientoInventario.groupBy({
      by: ["productoId"],
      where: { empresaId: r.id },
      _sum: { cantidad: true },
    });
    const suma = new Map(movs.map((m) => [m.productoId, Number(m._sum.cantidad)]));
    for (const p of productos) expect(Number(p.stock)).toBeCloseTo(suma.get(p.id) ?? 0, 3);
    // Reiniciar otra vez deja lo mismo, y Camila sigue intacta.
    const r2 = await reiniciarDemo(ce, { dias: 4, semilla: 7 });
    expect(r2.ok && r2.id).toBe(r.id);
    expect((await obtenerDemo(ce))!.ventas).toBe(demo.ventas);
    expect(await prisma.empresa.count({ where: { esDemo: true } })).toBe(1);
    expect(await prisma.producto.count({ where: { empresaId: { not: r.id } } })).toBe(antes);
    expect(await prisma.negocio.count({ where: { empresaId: e.camila.id } })).toBe(2);
  }, 120_000);

  it("no se adueña de un usuario 'demo' de un cliente real", async () => {
    await prisma.usuario.create({
      data: { empresaId: e.camila.id, usuario: "demo", nombre: "x", rol: "CAJERO", hashContrasena: "x" },
    });
    const r = await reiniciarDemo(ce, { dias: 1 });
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/otra empresa/) });
  });
});
