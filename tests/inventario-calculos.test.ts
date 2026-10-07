import { describe, expect, it } from "vitest";
import { formatearCantidad, leerCantidad, validarCantidad } from "@/lib/inventario/cantidades";
import { leerPesos } from "@/lib/inventario/esquemas";
import { calcularMargen, margenEfectivo, precioSugerido } from "@/lib/inventario/precios";

describe("cantidades", () => {
  it("lee cantidades escritas a la colombiana", () => {
    expect(leerCantidad("2,5")?.toString()).toBe("2.5");
    expect(leerCantidad("0,350")?.toString()).toBe("0.35");
    expect(leerCantidad("1.250")?.toString()).toBe("1250");
    expect(leerCantidad("1.250,75")?.toString()).toBe("1250.75");
    expect(leerCantidad("0.5")?.toString()).toBe("0.5");
    expect(leerCantidad("abc")).toBeNull();
    expect(leerCantidad("")).toBeNull();
  });

  it("los productos por unidad solo aceptan enteros", () => {
    expect(validarCantidad(leerCantidad("2,5"), { fraccionado: false })).toBe("entera");
    expect(validarCantidad(leerCantidad("3"), { fraccionado: false })).toBeNull();
    expect(validarCantidad(leerCantidad("2,5"), { fraccionado: true })).toBeNull();
  });

  it("acepta hasta 3 decimales y rechaza negativos", () => {
    expect(validarCantidad(leerCantidad("0,125"), { fraccionado: true })).toBeNull();
    expect(validarCantidad(leerCantidad("0,1255"), { fraccionado: true })).toBe("decimales");
    expect(validarCantidad(leerCantidad("-1"), { fraccionado: false })).toBe("negativa");
    expect(validarCantidad(leerCantidad("-1"), { fraccionado: false, permitirNegativa: true })).toBeNull();
  });

  it("muestra cantidades con coma decimal", () => {
    expect(formatearCantidad("2.5")).toBe("2,5");
    expect(formatearCantidad("1250")).toBe("1.250");
  });
});

describe("pesos", () => {
  it("lee valores en pesos con o sin formato", () => {
    expect(leerPesos("$ 13.000")).toBe(13000);
    expect(leerPesos("13000")).toBe(13000);
    expect(leerPesos("1.250.000")).toBe(1250000);
    expect(leerPesos("13.000,50")).toBe(13001);
    expect(leerPesos("13,000")).toBe(13000);
    expect(leerPesos("doce")).toBeNull();
    expect(leerPesos("15.6")).toBeNull(); // ambiguo: mejor pedir que lo corrija
    expect(leerPesos("12000,5")).toBe(12001);
  });
});

describe("margen y precio sugerido", () => {
  it("calcula el margen sobre el costo", () => {
    expect(precioSugerido(10000, 30)).toBe(13000);
    expect(calcularMargen(10000, 13000)).toEqual({ ganancia: 3000, porcentaje: 30 });
  });

  it("redondea el precio sugerido hacia arriba: a $ 50 si es pequeño, a $ 100 desde $ 1.000", () => {
    expect(precioSugerido(10031, 30)).toBe(13100); // 13.040,3 → 13.100
    expect(precioSugerido(250, 60)).toBe(400);
    expect(precioSugerido(500, 30)).toBe(650);
    expect(precioSugerido(60, 30)).toBe(100); // 78 → 100
    expect(precioSugerido(700, 30)).toBe(950); // 910 → 950
    expect(precioSugerido(0, 30)).toBe(0);
  });

  it("el margen de la categoría manda sobre el del negocio", () => {
    expect(margenEfectivo(30, 60)).toBe(60);
    expect(margenEfectivo(30, null)).toBe(30);
    expect(margenEfectivo(30, 0)).toBe(0);
  });
});
