import { describe, expect, it } from "vitest";
import { corregirLector } from "@/lib/inventario/lector";

describe("lector con teclado en español", () => {
  it("convierte las comillas en guiones", () => {
    expect(corregirLector("PR'0001'11'AZC")).toBe("PR-0001-11-AZC");
  });
  it("no toca un código ya bien escrito", () => {
    expect(corregirLector("PR-0001-11-AZC")).toBeNull();
  });
});
