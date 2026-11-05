// Cambio de turno entre cajeras y gastos anotados por un cajero con permiso.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { abrirCaja, cerrarCaja, verResumenDeCaja } from "@/lib/datos/caja";
import { prisma } from "@/lib/datos/cliente";
import { cargarContexto, type Contexto } from "@/lib/datos/contexto";
import { registrarMovimientoCaja } from "@/lib/datos/movimientos-caja";
import { diferenciaDelTurno, entregarTurno, turnosDeCaja } from "@/lib/datos/turnos";
import { diaEnBogota } from "@/lib/formato";
import { crearEscenario, type Escenario } from "./escenario";

let e: Escenario;
let cajaId: string;

beforeEach(async () => {
  e = await crearEscenario();
  const c = await abrirCaja(e.ctx.cajero, e.motos.id, 100000);
  if (!c.ok) throw new Error(c.error);
  cajaId = c.id;
});

afterAll(() => prisma.$disconnect());

async function ingreso(valor: number) {
  // Simula ventas en efectivo con un ingreso a la caja.
  const r = await registrarMovimientoCaja(e.ctx.admin, e.motos.id, {
    categoria: "OTRO_INGRESO", valor, medio: "EFECTIVO", fecha: diaEnBogota(), desdeCaja: true,
  });
  if (!r.ok) throw new Error(r.error);
}

describe("cambio de turno", () => {
  it("la diferencia de cada turno no arrastra la del turno anterior", () => {
    expect(diferenciaDelTurno(98000, 100000, [])).toBe(-2000);
    // La tarde cuenta 2.000 menos de lo esperado, pero ese faltante era de la mañana: la tarde cuadra.
    expect(diferenciaDelTurno(148000, 150000, [-2000])).toBe(0);
  });

  it("la cajera entrega su turno a ciegas, la caja sigue abierta y el admin ve cada turno", async () => {
    await ingreso(50000);
    const t = await entregarTurno(e.ctx.cajero, cajaId, 148000, "Laura");
    expect(t).toMatchObject({ ok: true, diferencia: null });
    expect((await prisma.caja.findUniqueOrThrow({ where: { id: cajaId } })).estado).toBe("ABIERTA");

    await ingreso(30000);
    const t2 = await entregarTurno(e.ctx.admin, cajaId, 178000, null);
    expect(t2).toMatchObject({ ok: true, diferencia: 0 });

    await ingreso(10000);
    const cierre = await cerrarCaja(e.ctx.admin, cajaId, 189000, null);
    expect(cierre).toMatchObject({ ok: true, diferencia: -1000 });
    const { turnos, diferenciaUltimo } = await turnosDeCaja(e.ctx.admin, cajaId);
    expect(turnos.map((x) => x.diferencia)).toEqual([-2000, 0]);
    expect(diferenciaUltimo).toBe(1000);
    // El cajero no ve los turnos.
    expect((await turnosDeCaja(e.ctx.cajero, cajaId)).turnos).toEqual([]);
  });

  it("no se entrega turno de una caja cerrada ni de otra empresa", async () => {
    await expect(entregarTurno(e.ctx.adminOtra, cajaId, 1000, null)).resolves.toMatchObject({ ok: false });
    await cerrarCaja(e.ctx.admin, cajaId, 100000, null);
    expect(await entregarTurno(e.ctx.cajero, cajaId, 100000, null)).toMatchObject({ ok: false, error: "Esta caja ya está cerrada." });
    expect(await prisma.turnoCaja.count()).toBe(0);
  });
});

describe("gastos del cajero", () => {
  async function cajeroConPermiso(): Promise<Contexto> {
    await prisma.usuario.update({ where: { id: e.ctx.cajero.usuarioId }, data: { puedeRegistrarGastos: true } });
    return (await cargarContexto(e.ctx.cajero.usuarioId))!;
  }

  it("sin permiso el cajero no anota gastos", async () => {
    await expect(
      registrarMovimientoCaja(e.ctx.cajero, e.motos.id, {
        categoria: "SERVICIOS", valor: 80000, medio: "EFECTIVO", fecha: diaEnBogota(), desdeCaja: true,
      }),
    ).rejects.toThrow();
  });

  it("con permiso anota un gasto en efectivo de hoy y sale de la caja", async () => {
    const ctx = await cajeroConPermiso();
    const r = await registrarMovimientoCaja(ctx, e.motos.id, {
      categoria: "SERVICIOS", valor: 80000, medio: "EFECTIVO", fecha: diaEnBogota(), desdeCaja: true,
    });
    expect(r.ok).toBe(true);
    expect((await verResumenDeCaja(e.ctx.admin, cajaId))?.esperado).toBe(20000);
  });

  it("con permiso no puede anotar ingresos, retiros, transferencias ni otros días", async () => {
    const ctx = await cajeroConPermiso();
    const base = { valor: 1000, medio: "EFECTIVO" as const, fecha: diaEnBogota(), desdeCaja: true };
    expect((await registrarMovimientoCaja(ctx, e.motos.id, { ...base, categoria: "OTRO_INGRESO" })).ok).toBe(false);
    expect((await registrarMovimientoCaja(ctx, e.motos.id, { ...base, categoria: "RETIRO_DUENO" })).ok).toBe(false);
    expect((await registrarMovimientoCaja(ctx, e.motos.id, { ...base, categoria: "SERVICIOS", medio: "TRANSFERENCIA" })).ok).toBe(false);
    expect((await registrarMovimientoCaja(ctx, e.motos.id, { ...base, categoria: "SERVICIOS", fecha: "2026-01-01" })).ok).toBe(false);
    expect(await prisma.movimientoCaja.count()).toBe(0);
  });

  it("el permiso no sirve en un negocio que no tiene asignado", async () => {
    const ctx = await cajeroConPermiso();
    await expect(
      registrarMovimientoCaja(ctx, e.ferreteria.id, {
        categoria: "SERVICIOS", valor: 1000, medio: "EFECTIVO", fecha: diaEnBogota(), desdeCaja: true,
      }),
    ).rejects.toThrow();
  });
});
