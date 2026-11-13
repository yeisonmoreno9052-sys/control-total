// Datáfono y Sistecrédito: solo si el negocio los activa, quedan en la venta con su medio
// y en el cierre salen aparte, sin sumar al efectivo esperado.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { abrirCaja, verResumenDeCaja } from "@/lib/datos/caja";
import { prisma } from "@/lib/datos/cliente";
import { crearProducto } from "@/lib/datos/inventario";
import { guardarPreferenciasVenta } from "@/lib/datos/negocios";
import { listarVentas, registrarVenta } from "@/lib/datos/ventas";
import { esquemaProducto } from "@/lib/inventario/esquemas";
import { calcularPago, type FormaPago } from "@/lib/ventas/totales";
import { crearEscenario, type Escenario } from "./escenario";

let e: Escenario;
let producto: string;
let cajaId: string;

beforeEach(async () => {
  e = await crearEscenario();
  const p = await crearProducto(
    e.ctx.admin,
    e.motos.id,
    esquemaProducto.parse({
      codigo: "BL1",
      nombre: "Blusa",
      costo: "20000",
      precioVenta: "45000",
      stockMinimo: "0",
      unidad: "UNIDAD",
      fraccionado: false,
      porcentajeIva: 0,
      condicion: "NUEVO",
    }),
    "10",
  );
  if (!p.ok) throw new Error(p.error);
  producto = p.id;
  const caja = await abrirCaja(e.ctx.cajero, e.motos.id, 100000);
  if (!caja.ok) throw new Error(caja.error);
  cajaId = caja.id;
});
afterAll(() => prisma.$disconnect());

const vender = (pago: FormaPago) =>
  registrarVenta(e.ctx.cajero, e.motos.id, {
    lineas: [{ productoId: producto, cantidad: "1" }],
    totalEsperado: 45000,
    pago,
  });

const activar = (aceptaTarjeta: boolean, aceptaSistecredito: boolean) =>
  guardarPreferenciasVenta(e.ctx.admin, e.motos.id, { ivaPorDefecto: "0", botonesRapidos: false, aceptaTarjeta, aceptaSistecredito });

describe("Datáfono y Sistecrédito", () => {
  it("el total va completo al medio, sin vueltas", () => {
    expect(calcularPago(45000, { forma: "tarjeta", referencia: " 0045 " })).toEqual({
      pagos: [{ medio: "TARJETA", valor: 45000, referencia: "0045" }],
      recibido: null,
      cambio: null,
    });
    expect(calcularPago(45000, { forma: "sistecredito" }).pagos[0].medio).toBe("SISTECREDITO");
  });

  it("no se puede cobrar así si el negocio no lo tiene activado", async () => {
    expect(await vender({ forma: "tarjeta" })).toMatchObject({ ok: false, error: "Este negocio no tiene activado el cobro con datáfono." });
    await activar(true, false);
    expect(await vender({ forma: "sistecredito" })).toMatchObject({ ok: false });
    expect((await vender({ forma: "tarjeta" })).ok).toBe(true);
  });

  it("en el cierre salen aparte y no suman al efectivo esperado", async () => {
    await activar(true, true);
    for (const pago of [{ forma: "tarjeta" }, { forma: "sistecredito" }, { forma: "efectivo", recibido: 50000 }] as FormaPago[]) {
      const r = await vender(pago);
      if (!r.ok) throw new Error(r.error);
    }
    const resumen = await verResumenDeCaja(e.ctx.admin, cajaId);
    expect(resumen).toMatchObject({ ventas: 3, ventasTarjeta: 45000, ventasSistecredito: 45000, ventasEfectivo: 45000 });
    expect(resumen?.esperado).toBe(145000);
    const historial = await listarVentas(e.ctx.admin, e.motos.id, { medio: "TARJETA" });
    expect(historial.ventas).toHaveLength(1);
  });
});
