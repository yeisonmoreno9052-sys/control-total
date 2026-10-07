// Fase 4: ingresos y egresos, y cómo cuentan en el cierre de caja.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AccesoDenegado } from "@/lib/datos/alcance";
import { abrirCaja, cerrarCaja, verResumenDeCaja } from "@/lib/datos/caja";
import { prisma } from "@/lib/datos/cliente";
import {
  anularMovimientoCaja,
  listarMovimientosCaja,
  registrarMovimientoCaja,
  type EntradaMovimientoCaja,
} from "@/lib/datos/movimientos-caja";
import { diaEnBogota } from "@/lib/formato";
import { crearEscenario, type Escenario } from "./escenario";

let e: Escenario;

beforeEach(async () => {
  e = await crearEscenario();
});

afterAll(() => prisma.$disconnect());

const hoy = () => diaEnBogota();

const mov = (extra: Partial<EntradaMovimientoCaja> = {}): EntradaMovimientoCaja => ({
  categoria: "NOMINA",
  valor: 50000,
  medio: "EFECTIVO",
  fecha: hoy(),
  pagadoA: "Andrés",
  desdeCaja: true,
  ...extra,
});

async function caja(negocioId: string, base = 100000) {
  const r = await abrirCaja(e.ctx.admin, negocioId, base);
  if (!r.ok) throw new Error(r.error);
  return r.id;
}

describe("ingresos y egresos", () => {
  it("un egreso en efectivo de hoy sale de la caja; un ingreso entra; la transferencia no toca la caja", async () => {
    // Sin caja abierta no se puede sacar de la caja…
    const sinCaja = await registrarMovimientoCaja(e.ctx.admin, e.motos.id, mov());
    expect(sinCaja.ok).toBe(false);
    // …pero sí si se desmarca.
    expect((await registrarMovimientoCaja(e.ctx.admin, e.motos.id, mov({ desdeCaja: false }))).ok).toBe(true);

    const cajaId = await caja(e.motos.id);
    await registrarMovimientoCaja(e.ctx.admin, e.motos.id, mov({ valor: 30000 }));
    await registrarMovimientoCaja(e.ctx.admin, e.motos.id, mov({ categoria: "APORTE", valor: 20000, pagadoA: null }));
    await registrarMovimientoCaja(e.ctx.admin, e.motos.id, mov({ categoria: "ARRIENDO", medio: "TRANSFERENCIA", valor: 900000 }));

    const resumen = await verResumenDeCaja(e.ctx.admin, cajaId);
    expect(resumen?.egresosEfectivo).toBe(30000);
    expect(resumen?.ingresosEfectivo).toBe(20000);
    expect(resumen?.esperado).toBe(100000 - 30000 + 20000);
  });

  it("lo de otro día no toca la caja de hoy", async () => {
    const cajaId = await caja(e.motos.id);
    const r = await registrarMovimientoCaja(e.ctx.admin, e.motos.id, mov({ fecha: "2026-01-15" }));
    expect(r.ok).toBe(true);
    expect((await verResumenDeCaja(e.ctx.admin, cajaId))?.esperado).toBe(100000);
  });

  it("valida valor, fecha futura y categoría", async () => {
    expect((await registrarMovimientoCaja(e.ctx.admin, e.motos.id, mov({ valor: 0, desdeCaja: false }))).ok).toBe(false);
    expect((await registrarMovimientoCaja(e.ctx.admin, e.motos.id, mov({ valor: 10.5, desdeCaja: false }))).ok).toBe(false);
    expect((await registrarMovimientoCaja(e.ctx.admin, e.motos.id, mov({ fecha: "2999-01-01", desdeCaja: false }))).ok).toBe(
      false,
    );
    const malo = mov({ desdeCaja: false, categoria: "INVENTADA" as EntradaMovimientoCaja["categoria"] });
    expect((await registrarMovimientoCaja(e.ctx.admin, e.motos.id, malo)).ok).toBe(false);
  });

  it("anular: pide motivo, devuelve la plata a la caja, queda en auditoría y no se puede con la caja cerrada", async () => {
    const cajaId = await caja(e.motos.id);
    const r = await registrarMovimientoCaja(e.ctx.admin, e.motos.id, mov({ valor: 30000 }));
    if (!r.ok) throw new Error(r.error);

    expect((await anularMovimientoCaja(e.ctx.admin, r.id, "")).ok).toBe(false);
    expect((await anularMovimientoCaja(e.ctx.admin, r.id, "Se registró dos veces")).ok).toBe(true);
    expect((await anularMovimientoCaja(e.ctx.admin, r.id, "Otra vez")).ok).toBe(false);
    expect((await verResumenDeCaja(e.ctx.admin, cajaId))?.esperado).toBe(100000);
    const auditoria = await prisma.auditoria.findFirst({ where: { accion: "ANULACION_MOVIMIENTO_CAJA", entidadId: r.id } });
    expect(auditoria).not.toBeNull();

    const otro = await registrarMovimientoCaja(e.ctx.admin, e.motos.id, mov({ valor: 10000 }));
    await cerrarCaja(e.ctx.admin, cajaId, 90000, null);
    if (otro.ok) expect((await anularMovimientoCaja(e.ctx.admin, otro.id, "Error")).ok).toBe(false);
  });

  it("la lista trae lo del rango, con quién lo registró", async () => {
    await registrarMovimientoCaja(e.ctx.admin, e.motos.id, mov({ desdeCaja: false, fecha: "2026-01-10" }));
    await registrarMovimientoCaja(
      e.ctx.admin,
      e.motos.id,
      mov({ desdeCaja: false, fecha: "2026-02-10", categoria: "SERVICIOS" }),
    );
    const enero = await listarMovimientosCaja(e.ctx.admin, [e.motos.id], "2026-01-01", "2026-01-31");
    expect(enero.map((m) => m.categoria)).toEqual(["NOMINA"]);
    expect(enero[0].usuario).toBeTruthy();
    expect(enero[0].tipo).toBe("EGRESO");
  });
});

describe("permisos de ingresos y egresos", () => {
  it("el cajero no puede registrar ni ver", async () => {
    await expect(registrarMovimientoCaja(e.ctx.cajero, e.motos.id, mov({ desdeCaja: false }))).rejects.toBeInstanceOf(
      AccesoDenegado,
    );
    await expect(listarMovimientosCaja(e.ctx.cajero, [e.motos.id], "2026-01-01", "2026-12-31")).rejects.toBeInstanceOf(
      AccesoDenegado,
    );
  });

  it("el socio de la ferretería no ve ni toca motos; otra empresa tampoco", async () => {
    const r = await registrarMovimientoCaja(e.ctx.admin, e.motos.id, mov({ desdeCaja: false }));
    if (!r.ok) throw new Error(r.error);
    await expect(registrarMovimientoCaja(e.ctx.socio, e.motos.id, mov({ desdeCaja: false }))).rejects.toBeInstanceOf(
      AccesoDenegado,
    );
    await expect(listarMovimientosCaja(e.ctx.socio, [e.motos.id], "2000-01-01", "2999-01-01")).rejects.toBeInstanceOf(
      AccesoDenegado,
    );
    expect((await anularMovimientoCaja(e.ctx.socio, r.id, "No es mío")).ok).toBe(false);
    expect((await anularMovimientoCaja(e.ctx.adminOtra, r.id, "No es mío")).ok).toBe(false);
    await expect(listarMovimientosCaja(e.ctx.adminOtra, [e.motos.id], "2000-01-01", "2999-01-01")).rejects.toBeInstanceOf(
      AccesoDenegado,
    );
    // El socio sí trabaja en su ferretería.
    expect((await registrarMovimientoCaja(e.ctx.socio, e.ferreteria.id, mov({ desdeCaja: false }))).ok).toBe(true);
  });
});
