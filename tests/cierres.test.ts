// Historial de cierres con filtro de fechas y detalle del cierre (para imprimir).
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AccesoDenegado } from "@/lib/datos/alcance";
import { abrirCaja, cerrarCaja, detalleDeCierre, listarCierres } from "@/lib/datos/caja";
import { prisma } from "@/lib/datos/cliente";
import { diaEnBogota } from "@/lib/formato";
import { sumarDias } from "@/lib/reportes/periodos";
import { crearEscenario, type Escenario } from "./escenario";

let e: Escenario;
beforeEach(async () => {
  e = await crearEscenario();
});
afterAll(() => prisma.$disconnect());

/** Caja ya cerrada de otro día, creada directo en la base. */
async function cajaDeOtroDia(dia: string, diferencia: number) {
  return prisma.caja.create({
    data: {
      empresaId: e.camila.id,
      negocioId: e.motos.id,
      fecha: new Date(`${dia}T00:00:00.000Z`),
      estado: "CERRADA",
      base: 0,
      abiertaPorId: e.ctx.admin.usuarioId,
      cerradaPorId: e.ctx.cajero.usuarioId,
      cerradaEn: new Date(`${dia}T23:00:00.000Z`),
      esperado: 10000,
      contado: 10000 + diferencia,
      diferencia,
    },
  });
}

describe("cierres", () => {
  it("filtra por fechas y dice quién cerró", async () => {
    const hoy = diaEnBogota();
    await cajaDeOtroDia(sumarDias(hoy, -40), 0);
    await cajaDeOtroDia(sumarDias(hoy, -3), -2000);
    const caja = await abrirCaja(e.ctx.admin, e.motos.id, 50000);
    if (!caja.ok) throw new Error(caja.error);
    await cerrarCaja(e.ctx.admin, caja.id, 50000, "Todo bien");

    const semana = await listarCierres(e.ctx.admin, e.motos.id, { desde: sumarDias(hoy, -6), hasta: hoy });
    expect(semana.map((c) => c.diferencia)).toEqual([0, -2000]);
    expect(semana[1].cerradaPor).toBe("cajero");
    expect(semana[0].cerradaPor).toBe("admin");
    expect(await listarCierres(e.ctx.admin, e.motos.id)).toHaveLength(3);
  });

  it("el detalle trae las cuentas, quién abrió y cerró, y respeta permisos", async () => {
    const caja = await abrirCaja(e.ctx.admin, e.motos.id, 50000);
    if (!caja.ok) throw new Error(caja.error);
    await cerrarCaja(e.ctx.admin, caja.id, 48000, null);
    const d = await detalleDeCierre(e.ctx.admin, caja.id);
    expect(d).toMatchObject({ negocio: "Repuestos de moto", abiertaPor: "admin", cerradaPor: "admin", esperado: 50000, diferencia: -2000 });
    expect(d?.resumen.base).toBe(50000);

    expect(await detalleDeCierre(e.ctx.adminOtra, caja.id)).toBeNull();
    expect(await detalleDeCierre(e.ctx.socio, caja.id)).toBeNull(); // el socio es de la ferretería
    await expect(detalleDeCierre(e.ctx.cajero, caja.id)).rejects.toBeInstanceOf(AccesoDenegado);
    await expect(listarCierres(e.ctx.socio, e.motos.id, { desde: diaEnBogota(), hasta: diaEnBogota() })).rejects.toBeInstanceOf(
      AccesoDenegado,
    );
  });
});
