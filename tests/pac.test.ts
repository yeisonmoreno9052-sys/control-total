// PAC (corresponsal): recargas y retiros con comisión. No son ventas y en el cierre van aparte.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AccesoDenegado } from "@/lib/datos/alcance";
import { abrirCaja, cerrarCaja, verResumenDeCaja } from "@/lib/datos/caja";
import { prisma } from "@/lib/datos/cliente";
import {
  anularOperacionPac,
  efectoEnCajon,
  listarOperacionesPac,
  registrarOperacionPac,
  totalesPac,
} from "@/lib/datos/pac";
import { resumenVentas } from "@/lib/datos/reportes";
import { diaEnBogota } from "@/lib/formato";
import { crearEscenario, type Escenario } from "./escenario";

let e: Escenario;

beforeEach(async () => {
  e = await crearEscenario();
  await prisma.negocio.update({ where: { id: e.motos.id }, data: { usaPac: true } });
});

afterAll(() => prisma.$disconnect());

const hoy = () => diaEnBogota();

async function caja(negocioId: string, base = 100000) {
  const r = await abrirCaja(e.ctx.admin, negocioId, base);
  if (!r.ok) throw new Error(r.error);
  return r.id;
}

describe("efecto en el cajón", () => {
  it("recarga en efectivo entra valor + comisión; por transferencia no toca; retiro saca valor − comisión", () => {
    expect(efectoEnCajon({ tipo: "RECARGA", medio: "EFECTIVO", valor: 150000, comision: 2000 })).toBe(152000);
    expect(efectoEnCajon({ tipo: "RECARGA", medio: "TRANSFERENCIA", valor: 150000, comision: 2000 })).toBe(0);
    expect(efectoEnCajon({ tipo: "RETIRO", medio: "EFECTIVO", valor: 100000, comision: 2000 })).toBe(-98000);
  });
});

describe("operaciones del PAC", () => {
  it("solo funciona si el negocio tiene el PAC activado", async () => {
    await caja(e.ferreteria.id);
    const r = await registrarOperacionPac(e.ctx.admin, e.ferreteria.id, { tipo: "RECARGA", valor: 20000, comision: 1000 });
    expect(r.ok).toBe(false);
  });

  it("si toca el cajón, la caja de hoy debe estar abierta; una recarga por transferencia no la necesita", async () => {
    const sinCaja = await registrarOperacionPac(e.ctx.cajero, e.motos.id, { tipo: "RECARGA", valor: 20000, comision: 1000 });
    expect(sinCaja.ok).toBe(false);
    const transfer = await registrarOperacionPac(e.ctx.cajero, e.motos.id, {
      tipo: "RECARGA",
      valor: 20000,
      comision: 1000,
      medio: "TRANSFERENCIA",
    });
    expect(transfer.ok).toBe(true);
  });

  it("el cierre suma y resta el PAC aparte, y no cuenta como venta", async () => {
    const cajaId = await caja(e.motos.id);
    const ok = async (r: Promise<{ ok: boolean }>) => expect((await r).ok).toBe(true);
    await ok(registrarOperacionPac(e.ctx.cajero, e.motos.id, { tipo: "RECARGA", valor: 150000, comision: 2000 }));
    await ok(registrarOperacionPac(e.ctx.cajero, e.motos.id, { tipo: "RECARGA", valor: 50000, comision: 1000, medio: "TRANSFERENCIA" }));
    // Un retiro siempre es en efectivo, aunque digan otra cosa.
    await ok(registrarOperacionPac(e.ctx.cajero, e.motos.id, { tipo: "RETIRO", valor: 100000, comision: 2000, medio: "TRANSFERENCIA" }));

    const r = await verResumenDeCaja(e.ctx.admin, cajaId);
    expect(r?.pacOperaciones).toBe(3);
    expect(r?.pacEntra).toBe(152000);
    expect(r?.pacSale).toBe(98000);
    expect(r?.pacComisiones).toBe(5000);
    expect(r?.esperado).toBe(100000 + 152000 - 98000);
    expect(r?.ventas).toBe(0);

    const ventas = await resumenVentas(e.ctx.admin, [e.motos.id], hoy(), hoy());
    expect(ventas.ventasNetas).toBe(0);
    expect(ventas.utilidadBruta).toBe(0);

    const lista = await listarOperacionesPac(e.ctx.admin, e.motos.id, hoy(), hoy());
    expect(totalesPac(lista)).toMatchObject({ operaciones: 3, movido: 300000, comisiones: 5000, efectivoNeto: 54000 });

    const cierre = await cerrarCaja(e.ctx.admin, cajaId, 154000, null);
    expect(cierre.ok && cierre.diferencia).toBe(0);
  });

  it("valida valor y comisión", async () => {
    await caja(e.motos.id);
    const mal = [
      { tipo: "RECARGA" as const, valor: 0, comision: 0 },
      { tipo: "RECARGA" as const, valor: 1000.5, comision: 0 },
      { tipo: "RECARGA" as const, valor: 10000, comision: -1 },
      { tipo: "RETIRO" as const, valor: 2000, comision: 2000 },
    ];
    for (const m of mal) expect((await registrarOperacionPac(e.ctx.admin, e.motos.id, m)).ok).toBe(false);
    expect((await registrarOperacionPac(e.ctx.admin, e.motos.id, { tipo: "RETIRO", valor: 5000, comision: 0 })).ok).toBe(true);
  });

  it("se anula con motivo (queda en el historial) y deja de contar; con la caja cerrada ya no se puede", async () => {
    const cajaId = await caja(e.motos.id);
    const r = await registrarOperacionPac(e.ctx.cajero, e.motos.id, { tipo: "RECARGA", valor: 50000, comision: 1000 });
    if (!r.ok) throw new Error(r.error);
    expect((await anularOperacionPac(e.ctx.cajero, r.id, "")).ok).toBe(false);
    expect((await anularOperacionPac(e.ctx.cajero, r.id, "Número equivocado")).ok).toBe(true);
    expect((await anularOperacionPac(e.ctx.cajero, r.id, "Otra vez")).ok).toBe(false);

    const resumen = await verResumenDeCaja(e.ctx.admin, cajaId);
    expect(resumen?.pacEntra).toBe(0);
    expect(resumen?.esperado).toBe(100000);
    const auditoria = await prisma.auditoria.findFirst({ where: { accion: "ANULACION_OPERACION_PAC", entidadId: r.id } });
    expect(auditoria?.usuarioId).toBe(e.ctx.cajero.usuarioId);

    const otra = await registrarOperacionPac(e.ctx.cajero, e.motos.id, { tipo: "RECARGA", valor: 20000, comision: 1000 });
    if (!otra.ok) throw new Error(otra.error);
    await cerrarCaja(e.ctx.admin, cajaId, 121000, null);
    expect((await anularOperacionPac(e.ctx.admin, otra.id, "Tarde")).ok).toBe(false);
  });
});

describe("aislamiento", () => {
  it("el socio de la ferretería no ve ni registra el PAC de motos; otra empresa no lo encuentra", async () => {
    await caja(e.motos.id);
    const r = await registrarOperacionPac(e.ctx.admin, e.motos.id, { tipo: "RECARGA", valor: 30000, comision: 1000 });
    if (!r.ok) throw new Error(r.error);

    await expect(listarOperacionesPac(e.ctx.socio, e.motos.id, hoy(), hoy())).rejects.toThrow(AccesoDenegado);
    await expect(
      registrarOperacionPac(e.ctx.socio, e.motos.id, { tipo: "RECARGA", valor: 30000, comision: 1000 }),
    ).rejects.toThrow(AccesoDenegado);
    expect((await anularOperacionPac(e.ctx.socio, r.id, "No es mía")).ok).toBe(false);
    expect((await anularOperacionPac(e.ctx.adminOtra, r.id, "No es mía")).ok).toBe(false);
    await expect(listarOperacionesPac(e.ctx.adminOtra, e.motos.id, hoy(), hoy())).rejects.toThrow(AccesoDenegado);
  });
});
