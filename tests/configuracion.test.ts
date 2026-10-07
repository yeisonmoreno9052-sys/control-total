// Datos del negocio, logo y textos del recibo: permisos y aislamiento.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AccesoDenegado } from "@/lib/datos/alcance";
import { prisma } from "@/lib/datos/cliente";
import { guardarLogo, obtenerEmpresa, obtenerLogo } from "@/lib/datos/empresa";
import { guardarDatosNegocio, obtenerDatosNegocio } from "@/lib/datos/negocios";
import { formatearConsecutivo, telefonoWhatsApp, textoWhatsApp } from "@/lib/ventas/recibo";
import { crearEscenario, type Escenario } from "./escenario";

let e: Escenario;
beforeEach(async () => {
  e = await crearEscenario();
});
afterAll(() => prisma.$disconnect());

const datos = { nombre: "Ferretería Camila", nit: "901.222.333-1", razonSocial: "", regimen: "", direccion: "Calle 1", telefono: "", mensajeRecibo: "Gracias" };
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe("datos del negocio", () => {
  it("el socio edita su negocio y los vacíos quedan en null", async () => {
    expect((await guardarDatosNegocio(e.ctx.socio, e.ferreteria.id, datos)).ok).toBe(true);
    const n = await obtenerDatosNegocio(e.ctx.socio, e.ferreteria.id);
    expect(n).toMatchObject({ nombre: "Ferretería Camila", nit: "901.222.333-1", razonSocial: null, mensajeRecibo: "Gracias" });
  });

  it("el socio no toca el negocio de motos, ni otra empresa el de Camila", async () => {
    expect((await guardarDatosNegocio(e.ctx.socio, e.motos.id, datos)).ok).toBe(false);
    expect((await guardarDatosNegocio(e.ctx.adminOtra, e.motos.id, datos)).ok).toBe(false);
    expect(await obtenerDatosNegocio(e.ctx.socio, e.motos.id)).toBeNull();
    const motos = await prisma.negocio.findUniqueOrThrow({ where: { id: e.motos.id } });
    expect(motos.nombre).toBe("Repuestos de moto");
  });

  it("el cajero no puede editar", async () => {
    await expect(guardarDatosNegocio(e.ctx.cajero, e.motos.id, datos)).rejects.toThrow(AccesoDenegado);
  });

  it("no deja cambiar el consecutivo por este camino", async () => {
    await guardarDatosNegocio(e.ctx.admin, e.motos.id, { ...datos, consecutivoVenta: 999 });
    const motos = await prisma.negocio.findUniqueOrThrow({ where: { id: e.motos.id } });
    expect(motos.consecutivoVenta).toBe(0);
  });
});

describe("logo", () => {
  it("solo el administrador lo cambia y se valida por su contenido", async () => {
    await expect(guardarLogo(e.ctx.socio, PNG)).rejects.toThrow(AccesoDenegado);
    await expect(guardarLogo(e.ctx.cajero, PNG)).rejects.toThrow(AccesoDenegado);
    expect((await guardarLogo(e.ctx.admin, new TextEncoder().encode("<script>alert(1)</script>"))).ok).toBe(false);
    expect((await guardarLogo(e.ctx.admin, new Uint8Array(301 * 1024))).ok).toBe(false);

    expect((await guardarLogo(e.ctx.admin, PNG)).ok).toBe(true);
    expect((await obtenerLogo(e.ctx.cajero))?.tipo).toBe("image/png");
    expect((await obtenerEmpresa(e.ctx.cajero))?.logoUrl).toMatch(/^\/api\/logo\?v=\d+$/);
    // Otra empresa no ve el logo de Camila.
    expect(await obtenerLogo(e.ctx.adminOtra)).toBeNull();

    expect((await guardarLogo(e.ctx.admin, null)).ok).toBe(true);
    expect(await obtenerLogo(e.ctx.admin)).toBeNull();
  });
});

describe("textos del recibo", () => {
  it("consecutivo y celular para WhatsApp", () => {
    expect(formatearConsecutivo(128)).toBe("000128");
    expect(telefonoWhatsApp("300 123 4567")).toBe("573001234567");
    expect(telefonoWhatsApp("+57 300-123-4567")).toBe("573001234567");
    expect(telefonoWhatsApp("604 444 5555")).toBeNull();
    expect(telefonoWhatsApp(null)).toBeNull();
  });

  it("el texto de WhatsApp trae productos, total, pago y cambio", () => {
    const texto = textoWhatsApp(
      {
        consecutivo: 7,
        creadoEn: new Date("2026-10-07T20:30:00Z"),
        total: 17150,
        descuento: 850,
        cambio: 2850,
        estado: "REGISTRADA",
        detalles: [{ nombre: "Cable #12", cantidad: "2.5", unidad: "METRO", total: 4500 }],
        pagos: [{ medio: "EFECTIVO", valor: 17150 }],
      },
      "Ferretería",
      "Gracias",
    );
    expect(texto).toContain("Recibo Nº 000007 · 07/10/2026");
    expect(texto).toContain("2,5 m Cable #12: $ 4.500");
    expect(texto).toContain("*Total: $ 17.150*");
    expect(texto).toContain("Cambio: $ 2.850");
    expect(texto).toContain("Gracias");
  });
});
