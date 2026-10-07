// CLAUDE.md §9: cálculo de totales e impuestos.
import { describe, expect, it } from "vitest";
import { calcularPago, calcularTotales, ErrorTotales, repartir, separarIva } from "@/lib/ventas/totales";

describe("separar el IVA de un precio que ya lo incluye", () => {
  it("19 %, 5 % y 0 %", () => {
    expect(separarIva(11900, 19)).toEqual({ base: 10000, iva: 1900 });
    expect(separarIva(10500, 5)).toEqual({ base: 10000, iva: 500 });
    expect(separarIva(8000, 0)).toEqual({ base: 8000, iva: 0 });
  });

  it("redondea al peso y base + IVA siempre da el total", () => {
    for (const total of [1, 99, 100, 4500, 7650, 12345, 999999]) {
      const { base, iva } = separarIva(total, 19);
      expect(base + iva).toBe(total);
      expect(Number.isInteger(base)).toBe(true);
    }
    expect(separarIva(5000, 19)).toEqual({ base: 4202, iva: 798 });
  });
});

describe("repartir un descuento general", () => {
  it("en proporción y sin perder pesos", () => {
    expect(repartir(100, [50, 50])).toEqual([50, 50]);
    expect(repartir(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(repartir(1000, [5000, 4500, 7650]).reduce((a, b) => a + b)).toBe(1000);
    expect(repartir(0, [10, 20])).toEqual([0, 0]);
  });
});

describe("totales de la venta", () => {
  it("la venta del boceto: tornillos, cable por metros y brocha con 10 %", () => {
    const t = calcularTotales([
      { precioUnitario: 100, cantidad: "50", porcentajeIva: 19 },
      { precioUnitario: 1800, cantidad: "2.5", porcentajeIva: 19 },
      { precioUnitario: 8500, cantidad: "1", porcentajeIva: 19, descuento: { tipo: "porcentaje", valor: 10 } },
    ]);
    expect(t.subtotal).toBe(18000);
    expect(t.descuento).toBe(850);
    expect(t.total).toBe(17150);
    expect(t.base + t.iva).toBe(t.total);
    expect(t.lineas.map((l) => l.total)).toEqual([5000, 4500, 7650]);
    expect(t.iva).toBe(798 + 718 + 1221);
  });

  it("cantidades fraccionadas se redondean al peso", () => {
    const t = calcularTotales([{ precioUnitario: 12990, cantidad: "0.35", porcentajeIva: 0 }]);
    expect(t.total).toBe(4547); // 4.546,5 sube a 4.547
  });

  it("descuento por línea en pesos y descuento general en porcentaje", () => {
    const t = calcularTotales(
      [
        { precioUnitario: 10000, cantidad: "2", porcentajeIva: 19, descuento: { tipo: "pesos", valor: 2000 } },
        { precioUnitario: 5000, cantidad: "1", porcentajeIva: 0 },
      ],
      { tipo: "porcentaje", valor: 10 },
    );
    // Neto: 18.000 + 5.000 = 23.000; 10 % = 2.300 repartido 1.800 / 500
    expect(t.lineas.map((l) => l.descuentoGeneral)).toEqual([1800, 500]);
    expect(t.lineas.map((l) => l.total)).toEqual([16200, 4500]);
    expect(t.total).toBe(20700);
    expect(t.descuento).toBe(2000 + 2300);
    expect(t.lineas[1].iva).toBe(0); // la línea sin IVA sigue sin IVA
    expect(t.base + t.iva).toBe(t.total);
  });

  it("descuento general en pesos", () => {
    const t = calcularTotales(
      [
        { precioUnitario: 3000, cantidad: "1", porcentajeIva: 19 },
        { precioUnitario: 7000, cantidad: "1", porcentajeIva: 5 },
      ],
      { tipo: "pesos", valor: 1000 },
    );
    expect(t.lineas.map((l) => l.descuentoGeneral)).toEqual([300, 700]);
    expect(t.total).toBe(9000);
  });

  it("rechaza descuentos imposibles y cantidades en cero", () => {
    const linea = { precioUnitario: 1000, cantidad: "1", porcentajeIva: 19 };
    expect(() => calcularTotales([{ ...linea, descuento: { tipo: "pesos", valor: 1500 } }])).toThrow(ErrorTotales);
    expect(() => calcularTotales([{ ...linea, descuento: { tipo: "porcentaje", valor: 120 } }])).toThrow(ErrorTotales);
    expect(() => calcularTotales([linea], { tipo: "pesos", valor: -5 })).toThrow(ErrorTotales);
    expect(() => calcularTotales([{ ...linea, cantidad: "0" }])).toThrow(ErrorTotales);
  });
});

describe("pagos", () => {
  it("efectivo calcula el cambio", () => {
    expect(calcularPago(17150, { forma: "efectivo", recibido: 20000 })).toEqual({
      pagos: [{ medio: "EFECTIVO", valor: 17150, referencia: null }],
      recibido: 20000,
      cambio: 2850,
    });
    expect(() => calcularPago(17150, { forma: "efectivo", recibido: 17000 })).toThrow(ErrorTotales);
  });

  it("transferencia por el total", () => {
    const p = calcularPago(50000, { forma: "transferencia", referencia: " Nequi 123 " });
    expect(p.pagos).toEqual([{ medio: "TRANSFERENCIA", valor: 50000, referencia: "Nequi 123" }]);
    expect(p.cambio).toBeNull();
  });

  it("mixto: las dos partes suman el total y el cambio sale de la parte en efectivo", () => {
    const p = calcularPago(50000, { forma: "mixto", transferencia: 30000, recibido: 25000 });
    expect(p.pagos.map((x) => [x.medio, x.valor])).toEqual([
      ["EFECTIVO", 20000],
      ["TRANSFERENCIA", 30000],
    ]);
    expect(p.cambio).toBe(5000);
    expect(() => calcularPago(50000, { forma: "mixto", transferencia: 50000, recibido: 0 })).toThrow(ErrorTotales);
    expect(() => calcularPago(50000, { forma: "mixto", transferencia: 30000, recibido: 10000 })).toThrow(ErrorTotales);
  });
});
