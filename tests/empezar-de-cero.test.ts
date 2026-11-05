// Empezar de cero (panel EMY): borra los datos de prueba de un cliente y nada más.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { abrirCaja } from "@/lib/datos/caja";
import { prisma } from "@/lib/datos/cliente";
import { cargarSuperadmin, empezarDeCero, type ContextoEmy } from "@/lib/datos/emy";
import { crearProducto } from "@/lib/datos/inventario";
import { registrarVenta } from "@/lib/datos/ventas";
import { esquemaProducto } from "@/lib/inventario/esquemas";
import { crearEscenario, type Escenario } from "./escenario";

let e: Escenario;
let ce: ContextoEmy;

beforeEach(async () => {
  e = await crearEscenario();
  const u = await prisma.usuario.create({
    data: { usuario: "emy", nombre: "Soporte", hashContrasena: "x", rol: "SUPERADMIN" },
  });
  ce = (await cargarSuperadmin(u.id))!;
});

afterAll(() => prisma.$disconnect());

async function productoYVenta(ctx = e.ctx.admin, negocioId = e.motos.id) {
  const p = await crearProducto(
    ctx,
    negocioId,
    esquemaProducto.parse({
      codigo: "TINTO", nombre: "Tinto", costo: "300", precioVenta: "1500", stockMinimo: "0",
      unidad: "UNIDAD", fraccionado: false, porcentajeIva: 0, condicion: "NUEVO", controlaStock: false,
    }),
    "0",
  );
  if (!p.ok) throw new Error(p.error);
  const caja = await abrirCaja(ctx, negocioId, 0);
  if (!caja.ok) throw new Error(caja.error);
  const v = await registrarVenta(ctx, negocioId, {
    lineas: [{ productoId: p.id, cantidad: "1" }],
    totalEsperado: 1500,
    pago: { forma: "efectivo", recibido: 1500 },
  });
  if (!v.ok) throw new Error(v.error);
}

describe("empezar de cero", () => {
  it("borra productos, ventas y cajas del cliente, deja usuarios y locales, y la numeración vuelve a 1", async () => {
    await productoYVenta();
    await productoYVenta(e.ctx.adminOtra, e.tiendaOtra.id);
    const usuarios = await prisma.usuario.count({ where: { empresaId: e.camila.id } });

    const r = await empezarDeCero(ce, e.camila.id, "Camila");
    expect(r).toMatchObject({ ok: true, productos: 1, ventas: 1 });

    const w = { empresaId: e.camila.id };
    expect(await prisma.producto.count({ where: w })).toBe(0);
    expect(await prisma.venta.count({ where: w })).toBe(0);
    expect(await prisma.caja.count({ where: w })).toBe(0);
    expect(await prisma.usuario.count({ where: w })).toBe(usuarios);
    expect(await prisma.negocio.count({ where: w })).toBe(2);
    expect((await prisma.negocio.findUniqueOrThrow({ where: { id: e.motos.id } })).consecutivoVenta).toBe(0);
    expect(await prisma.accionEmy.count({ where: { ...w, accion: "EMPEZAR_DE_CERO" } })).toBe(1);

    // La otra empresa no se toca.
    expect(await prisma.producto.count({ where: { empresaId: e.otra.id } })).toBe(1);
    expect(await prisma.venta.count({ where: { empresaId: e.otra.id } })).toBe(1);

    // Se puede volver a vender y empieza en la venta 1.
    await productoYVenta();
    expect((await prisma.venta.findFirstOrThrow({ where: w })).consecutivo).toBe(1);
  });

  it("pide el nombre exacto y solo lo hace el superadmin", async () => {
    await productoYVenta();
    expect(await empezarDeCero(ce, e.camila.id, "camilaa")).toMatchObject({ ok: false });
    await expect(empezarDeCero(null as never, e.camila.id, "Camila")).rejects.toThrow();
    expect(await prisma.venta.count({ where: { empresaId: e.camila.id } })).toBe(1);
  });
});
