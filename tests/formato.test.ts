import { describe, expect, it } from "vitest";
import { formatearFecha, formatearPesos } from "@/lib/formato";

describe("formato colombiano", () => {
  it("muestra pesos sin decimales con punto de miles", () => {
    expect(formatearPesos(1250000)).toBe("$ 1.250.000");
    expect(formatearPesos(0)).toBe("$ 0");
    expect(formatearPesos(-3500)).toBe("-$ 3.500");
  });

  it("muestra la fecha dd/mm/aaaa en hora de Bogotá", () => {
    // 3 de enero 2026 a las 2:00 a. m. UTC = 2 de enero 9:00 p. m. en Bogotá
    expect(formatearFecha(new Date("2026-01-03T02:00:00Z"))).toBe("02/01/2026");
  });
});
