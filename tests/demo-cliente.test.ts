// Demo para un cliente: su propia empresa con el nombre de su negocio, ejemplos de su
// tipo y su usuario; se apaga sola a los 15 días y se convierte en cliente sin perder
// su empresa ni su usuario.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { cifrarContrasena, verificarCredenciales } from "@/lib/datos/autenticacion";
import { prisma } from "@/lib/datos/cliente";
import { cargarContexto } from "@/lib/datos/contexto";
import { convertirDemoEnCliente, crearDemoCliente, DIAS_PRUEBA, extenderDemoCliente } from "@/lib/datos/demo-cliente";
import { cargarSuperadmin, empezarDeCero, listarClientes, resumirClientes, type ContextoEmy } from "@/lib/datos/emy";
import { crearEscenario, type Escenario } from "./escenario";

let e: Escenario;
let ce: ContextoEmy;
beforeEach(async () => {
  e = await crearEscenario();
  const u = await prisma.usuario.create({ data: { usuario: "emy", nombre: "Yeison", rol: "SUPERADMIN", hashContrasena: "x" } });
  ce = (await cargarSuperadmin(u.id))!;
});
afterAll(() => prisma.$disconnect());

const datos = (extra: Record<string, unknown> = {}) => ({
  negocio: "Ferretería Don Pedro",
  persona: "Pedro Gómez",
  tipo: "FER",
  usuario: "Pedro",
  telefono: "3001112233",
  ...extra,
});

/** Simula que la persona ya entró y creó su propia contraseña. */
async function ponerContrasena(usuario: string, contrasena: string) {
  await prisma.usuario.update({
    where: { usuario },
    data: { hashContrasena: await cifrarContrasena(contrasena), debeCambiarContrasena: false },
  });
}

describe("demo para un cliente", () => {
  it("crea su empresa con su nombre, un local de su tipo con ejemplos, y no toca a nadie más", async () => {
    const productosCamila = await prisma.producto.count({ where: { empresaId: e.camila.id } });
    const r = await crearDemoCliente(ce, datos(), { dias: 3 });
    if (!r.ok) throw new Error(r.error);
    expect(r.usuario).toBe("pedro");
    expect((await verificarCredenciales("pedro", r.contrasena)).ok).toBe(true);

    const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: r.id } });
    expect(empresa.nombre).toBe("Ferretería Don Pedro");
    expect(empresa.esDemo).toBe(false);
    const dias = (empresa.pruebaHasta!.getTime() - empresa.creadoEn.getTime()) / 86_400_000;
    expect(Math.round(dias)).toBe(DIAS_PRUEBA);

    const negocios = await prisma.negocio.findMany({ where: { empresaId: r.id } });
    expect(negocios.map((n) => [n.nombre, n.tipo])).toEqual([["Ferretería Don Pedro", "Ferretería"]]);
    const usuario = await prisma.usuario.findUniqueOrThrow({ where: { usuario: "pedro" } });
    expect(usuario).toMatchObject({ nombre: "Pedro Gómez", rol: "ADMINISTRADOR", debeCambiarContrasena: true, empresaId: r.id });

    expect(await prisma.producto.count({ where: { empresaId: r.id } })).toBeGreaterThan(50);
    expect(await prisma.venta.count({ where: { empresaId: r.id } })).toBeGreaterThan(10);
    // Las ventas de ejemplo salen a su nombre y la caja de hoy queda abierta para seguir vendiendo.
    expect(await prisma.venta.count({ where: { empresaId: r.id, usuarioId: { not: usuario.id } } })).toBe(0);
    expect(await prisma.caja.count({ where: { empresaId: r.id, cerradaEn: null } })).toBe(1);

    expect(await prisma.producto.count({ where: { empresaId: e.camila.id } })).toBe(productosCamila);
    // Ve solo lo suyo.
    const ctx = (await cargarContexto(usuario.id))!;
    expect(ctx.negociosPermitidos).toEqual([negocios[0].id]);
  }, 120_000);

  it("arma la cafetería con botones y la ropa con tallas", async () => {
    const cafe = await crearDemoCliente(ce, datos({ negocio: "Café Aroma", persona: "Ana", tipo: "CAF", usuario: "ana" }), { dias: 1 });
    const ropa = await crearDemoCliente(ce, datos({ negocio: "Boutique Luz", persona: "Luz", tipo: "ROP", usuario: "luz" }), { dias: 1 });
    if (!cafe.ok || !ropa.ok) throw new Error("no se creó");
    expect(await prisma.negocio.findFirst({ where: { empresaId: cafe.id, botonesRapidos: true } })).not.toBeNull();
    expect(await prisma.producto.count({ where: { empresaId: cafe.id, botonRapido: true } })).toBeGreaterThan(5);
    expect(await prisma.negocio.findFirst({ where: { empresaId: ropa.id, usaTallas: true } })).not.toBeNull();
    expect(await prisma.producto.count({ where: { empresaId: ropa.id, talla: { not: null } } })).toBeGreaterThan(50);
  }, 120_000);

  it("no cuenta como cliente en el panel", async () => {
    const antes = resumirClientes(await listarClientes(ce));
    const r = await crearDemoCliente(ce, datos(), { dias: 1 });
    if (!r.ok) throw new Error(r.error);
    expect(resumirClientes(await listarClientes(ce))).toEqual(antes);
  }, 120_000);

  it("pide los datos y no repite usuarios", async () => {
    const vacio = await crearDemoCliente(ce, { negocio: "", persona: "", tipo: "XXX", usuario: "a b" });
    expect(vacio).toMatchObject({ ok: false });
    if (!vacio.ok) expect(Object.keys(vacio.campos ?? {}).sort()).toEqual(["negocio", "persona", "tipo", "usuario"]);
    await prisma.usuario.create({ data: { empresaId: e.camila.id, usuario: "pedro", nombre: "x", rol: "CAJERO", hashContrasena: "x" } });
    expect(await crearDemoCliente(ce, datos())).toMatchObject({ ok: false, campos: { usuario: expect.any(String) } });
    expect(await prisma.empresa.count({ where: { nombre: "Ferretería Don Pedro" } })).toBe(0);
  });

  it("solo la crea el superadmin", async () => {
    await expect(crearDemoCliente(null as never, datos())).rejects.toThrow();
  });

  it("a los 15 días ya no deja entrar, y con más días vuelve a dejar", async () => {
    const r = await crearDemoCliente(ce, datos(), { dias: 1 });
    if (!r.ok) throw new Error(r.error);
    await ponerContrasena("pedro", "clave-de-pedro");
    const usuario = await prisma.usuario.findUniqueOrThrow({ where: { usuario: "pedro" } });
    const despues = new Date(Date.now() + (DIAS_PRUEBA + 1) * 86_400_000);
    expect(await verificarCredenciales("pedro", "clave-de-pedro", despues)).toEqual({ ok: false, motivo: "demo_vencida" });

    await prisma.empresa.update({ where: { id: r.id }, data: { pruebaHasta: new Date(Date.now() - 1000) } });
    expect(await verificarCredenciales("pedro", "clave-de-pedro")).toEqual({ ok: false, motivo: "demo_vencida" });
    expect(await cargarContexto(usuario.id)).toBeNull(); // la sesión abierta también se cierra

    const ext = await extenderDemoCliente(ce, r.id);
    if (!ext.ok) throw new Error(ext.error);
    expect(Math.round((ext.pruebaHasta.getTime() - Date.now()) / 86_400_000)).toBe(DIAS_PRUEBA);
    expect((await verificarCredenciales("pedro", "clave-de-pedro")).ok).toBe(true);
    expect(await cargarContexto(usuario.id)).not.toBeNull();
  }, 120_000);

  it("al convertirla en cliente borra los ejemplos y deja su empresa, local y contraseña", async () => {
    const r = await crearDemoCliente(ce, datos(), { dias: 2 });
    if (!r.ok) throw new Error(r.error);
    await ponerContrasena("pedro", "clave-de-pedro");
    const ventasCamila = await prisma.venta.count({ where: { empresaId: e.camila.id } });

    const c = await convertirDemoEnCliente(ce, r.id);
    if (!c.ok) throw new Error(c.error);
    expect(c.productos).toBeGreaterThan(50);
    for (const tabla of ["producto", "venta", "caja", "facturaCompra", "movimientoInventario", "movimientoCaja"] as const) {
      expect(await (prisma[tabla] as unknown as { count: (a: object) => Promise<number> }).count({ where: { empresaId: r.id } })).toBe(0);
    }
    const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: r.id } });
    expect(empresa.pruebaHasta).toBeNull();
    expect(await prisma.negocio.count({ where: { empresaId: r.id } })).toBe(1);
    expect((await verificarCredenciales("pedro", "clave-de-pedro")).ok).toBe(true);
    expect(await prisma.venta.count({ where: { empresaId: e.camila.id } })).toBe(ventasCamila);
    // Ya es cliente: cuenta en el panel, y no se puede "convertir" dos veces.
    expect(resumirClientes(await listarClientes(ce)).activos).toBeGreaterThan(0);
    expect(await convertirDemoEnCliente(ce, r.id)).toMatchObject({ ok: false });
  }, 120_000);

  it("no convierte ni extiende a un cliente real", async () => {
    const negocio = await prisma.negocio.findFirstOrThrow({ where: { empresaId: e.camila.id } });
    await prisma.producto.create({
      data: { empresaId: e.camila.id, negocioId: negocio.id, codigo: "X-1", nombre: "Aceite", precioVenta: 1000 },
    });
    expect(await convertirDemoEnCliente(ce, e.camila.id)).toMatchObject({ ok: false });
    expect(await extenderDemoCliente(ce, e.camila.id)).toMatchObject({ ok: false });
    expect(await prisma.producto.count({ where: { empresaId: e.camila.id } })).toBeGreaterThan(0);
  });

  it("empezar de cero sigue funcionando igual para un cliente real", async () => {
    const r = await empezarDeCero(ce, e.camila.id, "nombre equivocado");
    expect(r).toMatchObject({ ok: false });
  });
});
