// El emoji del saludo del inicio cambia según el negocio.
import { describe, expect, it } from "vitest";
import { EMOJI_POR_DEFECTO, emojiDeNegocio } from "@/lib/saludo";

describe("emoji del saludo", () => {
  it("lo adivina por el tipo o, si no hay, por el nombre", () => {
    expect(emojiDeNegocio({ nombre: "Club Cabbali", tipo: "Cafetería" })).toBe("☕");
    expect(emojiDeNegocio({ nombre: "Club cabbali", tipo: null })).toBe("☕");
    expect(emojiDeNegocio({ nombre: "Ferretería", tipo: "" })).toBe("🔧");
    expect(emojiDeNegocio({ nombre: "Repuestos de moto", tipo: null })).toBe("🏍️");
    expect(emojiDeNegocio({ nombre: "Local 1", tipo: "FERRETERIA" })).toBe("🔧");
  });

  it("si no lo reconoce, sale el de siempre", () => {
    expect(emojiDeNegocio({ nombre: "Local 1", tipo: null })).toBe(EMOJI_POR_DEFECTO);
    expect(emojiDeNegocio(null)).toBe(EMOJI_POR_DEFECTO);
  });
});
