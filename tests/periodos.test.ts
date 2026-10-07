import { describe, expect, it } from "vitest";
import {
  calcularPeriodo,
  describirPeriodo,
  periodoAnterior,
  periodoDeParametros,
  rangoUtc,
  variacion,
} from "@/lib/reportes/periodos";

const HOY = "2026-10-07"; // miércoles

describe("periodos de reportes", () => {
  it("hoy, ayer, semana (lunes a domingo), mes y mes pasado", () => {
    expect(calcularPeriodo("hoy", HOY)).toMatchObject({ desde: HOY, hasta: HOY });
    expect(calcularPeriodo("ayer", HOY)).toMatchObject({ desde: "2026-10-06", hasta: "2026-10-06" });
    expect(calcularPeriodo("semana", HOY)).toMatchObject({ desde: "2026-10-05", hasta: HOY });
    expect(calcularPeriodo("semana", "2026-10-11")).toMatchObject({ desde: "2026-10-05" }); // domingo
    expect(calcularPeriodo("mes", HOY)).toMatchObject({ desde: "2026-10-01", hasta: HOY });
    expect(calcularPeriodo("mes-pasado", HOY)).toMatchObject({ desde: "2026-09-01", hasta: "2026-09-30" });
    expect(calcularPeriodo("mes-pasado", "2026-03-15")).toMatchObject({ desde: "2026-02-01", hasta: "2026-02-28" });
  });

  it("periodo anterior para comparar", () => {
    expect(periodoAnterior(calcularPeriodo("hoy", HOY))).toMatchObject({ desde: "2026-10-06", hasta: "2026-10-06" });
    expect(periodoAnterior(calcularPeriodo("semana", HOY))).toMatchObject({ desde: "2026-09-28", hasta: "2026-09-30" });
    expect(periodoAnterior(calcularPeriodo("mes", HOY))).toMatchObject({ desde: "2026-09-01", hasta: "2026-09-07" });
    // El 31 de marzo se compara contra el 1 al 28 de febrero.
    expect(periodoAnterior(calcularPeriodo("mes", "2026-03-31"))).toMatchObject({ desde: "2026-02-01", hasta: "2026-02-28" });
    expect(periodoAnterior(calcularPeriodo("mes-pasado", HOY))).toMatchObject({ desde: "2026-08-01", hasta: "2026-08-31" });
    expect(periodoAnterior(calcularPeriodo("libre", HOY, "2026-10-01", "2026-10-10"))).toMatchObject({
      desde: "2026-09-21",
      hasta: "2026-09-30",
    });
  });

  it("lee la dirección: periodo, fechas libres, invertidas o dañadas", () => {
    expect(periodoDeParametros({}, "mes", HOY)).toMatchObject({ preset: "mes", desde: "2026-10-01" });
    expect(periodoDeParametros({ periodo: "ayer" }, "mes", HOY)).toMatchObject({ desde: "2026-10-06" });
    expect(periodoDeParametros({ periodo: "<script>" }, "hoy", HOY)).toMatchObject({ preset: "hoy" });
    expect(periodoDeParametros({ desde: "2026-10-05", hasta: "2026-10-01" }, "mes", HOY)).toMatchObject({
      desde: "2026-10-01",
      hasta: "2026-10-05",
    });
    expect(periodoDeParametros({ desde: "2020-01-01", hasta: HOY }, "mes", HOY).desde).toBe("2024-10-07");
  });

  it("rango en UTC para columnas con hora: el día de Bogotá empieza a las 5 a. m. UTC", () => {
    const r = rangoUtc("2026-10-01", "2026-10-07");
    expect(r.inicio.toISOString()).toBe("2026-10-01T05:00:00.000Z");
    expect(r.fin.toISOString()).toBe("2026-10-08T05:00:00.000Z");
  });

  it("variación y descripción", () => {
    expect(variacion(1120, 1000)).toBe(12);
    expect(variacion(500, 1000)).toBe(-50);
    expect(variacion(500, 0)).toBeNull();
    expect(describirPeriodo({ desde: "2026-10-01", hasta: "2026-10-07" })).toBe("1 al 7 de octubre de 2026");
    expect(describirPeriodo({ desde: HOY, hasta: HOY })).toBe("7 de octubre de 2026");
  });
});
