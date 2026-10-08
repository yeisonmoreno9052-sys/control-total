// Teclado numérico en pantalla: qué texto queda en el campo con cada tecla.
import { describe, expect, it } from "vitest";
import { aplicarTecla } from "@/components/ventas/teclado-numerico";

describe("aplicarTecla", () => {
  it("escribe al final, borra y limpia", () => {
    expect(aplicarTecla("", "5")).toBe("5");
    expect(aplicarTecla("5", "00")).toBe("500");
    expect(aplicarTecla("50.000", "borrar")).toBe("50.00");
    expect(aplicarTecla("", "borrar")).toBe("");
    expect(aplicarTecla("12.500", "limpiar")).toBe("");
  });

  it("la coma va una sola vez y empieza con 0 si el campo está vacío", () => {
    expect(aplicarTecla("", ",")).toBe("0,");
    expect(aplicarTecla("2", ",")).toBe("2,");
    expect(aplicarTecla("2,5", ",")).toBe("2,5");
  });
});
