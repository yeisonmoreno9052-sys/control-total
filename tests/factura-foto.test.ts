// Facturas con foto: conversión de lo leído, reconocimiento de productos,
// límite del mes y aislamiento entre empresas y negocios. La IA se simula.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AccesoDenegado, datosDe } from "@/lib/datos/alcance";
import { prisma } from "@/lib/datos/cliente";
import { guardarProveedor } from "@/lib/datos/compras";
import { cargarContexto, type Contexto } from "@/lib/datos/contexto";
import { crearProducto } from "@/lib/datos/inventario";
import { estadoFotos, inicioDelMes, leerFacturaConFoto } from "@/lib/datos/lectura-factura";
import { cantidadTexto, costoConIva, mismoNit, totalNoCuadra } from "@/lib/compras/lectura";
import { costoEnPesos } from "@/lib/ia/costo";
import type { FacturaLeida, LineaLeida } from "@/lib/ia/factura";
import type { LectorFacturas } from "@/lib/ia/lector";
import { esquemaProducto } from "@/lib/inventario/esquemas";
import { crearEscenario, type Escenario } from "./escenario";

let e: Escenario;

beforeEach(async () => {
  e = await crearEscenario();
});

afterAll(() => prisma.$disconnect());

// Una foto JPEG mínima (los primeros bytes son los que se revisan).
const FOTO = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);

function linea(datos: Partial<LineaLeida>): LineaLeida {
  return {
    codigo: null,
    codigoBarras: null,
    descripcion: "",
    cantidad: 1,
    unidad: null,
    valorUnitario: 1000,
    incluyeIva: true,
    porcentajeIva: null,
    descuentoPorcentaje: null,
    totalLinea: null,
    ...datos,
  };
}

function factura(datos: Partial<FacturaLeida> = {}): FacturaLeida {
  return {
    legible: true,
    proveedor: { nombre: "Distribuidora Andina S.A.S.", nit: "900.123.456-7", telefono: null },
    numero: "FV-2045",
    fecha: "2026-10-20",
    vencimiento: null,
    formaPago: "contado",
    total: 50000,
    lineas: [],
    nota: null,
    ...datos,
  };
}

/** Lector simulado: devuelve siempre la misma factura y cuenta las llamadas. */
function lectorFalso(f: FacturaLeida, tokens = { entrada: 3000, salida: 2000 }) {
  const lector: LectorFacturas & { llamadas: number } = {
    modelo: "claude-opus-5-5",
    llamadas: 0,
    async leer() {
      lector.llamadas++;
      return { ok: true, factura: f, uso: { modelo: "claude-opus-5-5", tokensEntrada: tokens.entrada, tokensSalida: tokens.salida } };
    },
  };
  return lector;
}

async function activarModulo(empresaId: string, limite = 50) {
  await prisma.empresa.update({
    where: { id: empresaId },
    data: { modulosActivos: { push: "FACTURA_FOTO" }, limiteFotosMes: limite },
  });
}

async function recargar(ctx: Contexto) {
  const nuevo = await cargarContexto(ctx.usuarioId);
  if (!nuevo) throw new Error("sin contexto");
  return nuevo;
}

async function producto(negocioId: string, datos: Record<string, unknown>) {
  const r = await crearProducto(
    e.ctx.admin,
    negocioId,
    esquemaProducto.parse({
      costo: "1000",
      precioVenta: "2000",
      stockMinimo: "0",
      unidad: "UNIDAD",
      fraccionado: false,
      porcentajeIva: 19,
      condicion: "NUEVO",
      ...datos,
    }),
    "5",
  );
  if (!r.ok) throw new Error(r.error);
  return r.id;
}

describe("convertir lo leído en líneas de la factura", () => {
  it("lleva el costo con IVA incluido, con descuento y redondeado al peso", () => {
    expect(costoConIva({ valorUnitario: 1000, incluyeIva: true, porcentajeIva: 19, descuentoPorcentaje: null })).toBe(1000);
    expect(costoConIva({ valorUnitario: 1000, incluyeIva: false, porcentajeIva: 19, descuentoPorcentaje: null })).toBe(1190);
    expect(costoConIva({ valorUnitario: 1000, incluyeIva: false, porcentajeIva: 19, descuentoPorcentaje: 10 })).toBe(1071);
    expect(costoConIva({ valorUnitario: 333.33, incluyeIva: false, porcentajeIva: 5, descuentoPorcentaje: null })).toBe(350);
    expect(costoConIva({ valorUnitario: 0, incluyeIva: true, porcentajeIva: null, descuentoPorcentaje: null })).toBe(0);
  });

  it("escribe las cantidades con coma decimal para que no se lean como miles", () => {
    expect(cantidadTexto(12)).toBe("12");
    expect(cantidadTexto(2.5)).toBe("2,5");
    expect(cantidadTexto(12.125)).toBe("12,125");
    expect(cantidadTexto(1.23456)).toBe("1,235");
    expect(cantidadTexto(0)).toBe("");
  });

  it("reconoce el mismo NIT con o sin dígito de verificación", () => {
    expect(mismoNit("900.123.456-7", "900123456")).toBe(true);
    expect(mismoNit("9001234567", "900123456-7")).toBe(true);
    expect(mismoNit("900123456", "800123456")).toBe(false);
    expect(mismoNit(null, "900123456")).toBe(false);
  });

  it("avisa cuando la suma no da el total impreso", () => {
    expect(totalNoCuadra(50000, 50000)).toBe(false);
    expect(totalNoCuadra(50050, 50000)).toBe(false);
    expect(totalNoCuadra(45000, 50000)).toBe(true);
    expect(totalNoCuadra(45000, null)).toBe(false);
  });

  it("calcula el costo aproximado en pesos", () => {
    // 3.000 de entrada × 4 US$ + 2.000 de salida × 20 US$ por millón = 0,052 US$ → $ 208 a 4.000.
    expect(costoEnPesos("claude-opus-5-5", 3000, 2000, 4000)).toBe(208);
  });
});

describe("leer una factura con foto", () => {
  it("reconoce productos por código de barras, por código y por nombre parecido, y el proveedor por NIT", async () => {
    await activarModulo(e.camila.id);
    const admin = await recargar(e.ctx.admin);
    const tornillo = await producto(e.ferreteria.id, { codigo: "TOR-14", codigoBarras: "7701234567890", nombre: "Tornillo hexagonal 1/4" });
    const cable = await producto(e.ferreteria.id, { codigo: "CAB-12", nombre: "Cable eléctrico calibre 12", unidad: "METRO", fraccionado: true });
    const pegante = await producto(e.ferreteria.id, { codigo: "PEG-1", nombre: "Pegante PVC tarro 1/4 galón" });
    const prov = await guardarProveedor(admin, e.ferreteria.id, null, { nombre: "Distribuidora Andina", nit: "900123456-7" });
    if (!prov.ok) throw new Error(prov.error);

    const lector = lectorFalso(
      factura({
        lineas: [
          linea({ codigoBarras: "7701234567890", descripcion: "TORNILLO HEX 1/4", cantidad: 100, valorUnitario: 100, incluyeIva: false, porcentajeIva: 19 }),
          linea({ codigo: "cab-12", descripcion: "CABLE #12", cantidad: 12.5, valorUnitario: 2000 }),
          linea({ descripcion: "PEGANTE PVC 1/4 GALON", cantidad: 2, valorUnitario: 15000 }),
          linea({ descripcion: "Brocha de cerda 2 pulgadas", cantidad: 3, valorUnitario: 4000 }),
        ],
      }),
    );
    const r = await leerFacturaConFoto(admin, e.ferreteria.id, [FOTO], lector);
    if (!r.ok) throw new Error(r.error);
    const f = r.factura;

    expect(f.proveedor.id).toBe(prov.id);
    expect(f.numero).toBe("FV-2045");
    expect(f.fecha).toBe("2026-10-20");
    expect(f.total).toBe(50000);

    const [l1, l2, l3, l4] = f.lineas;
    expect(l1).toMatchObject({ estado: "encontrado", cantidad: "100", costo: 119 });
    expect(l1.producto?.id).toBe(tornillo);
    expect(l2).toMatchObject({ estado: "encontrado", cantidad: "12,5", costo: 2000 });
    expect(l2.producto?.id).toBe(cable);
    expect(l3.estado).toBe("revisar");
    expect(l3.candidatos[0]?.id).toBe(pegante);
    expect(l4).toMatchObject({ estado: "nuevo", producto: null, descripcion: "Brocha de cerda 2 pulgadas", costo: 4000 });

    const lecturas = await prisma.lecturaFactura.findMany();
    expect(lecturas).toHaveLength(1);
    expect(lecturas[0]).toMatchObject({ exito: true, paginas: 1, tokensEntrada: 3000, tokensSalida: 2000 });
    expect(lecturas[0].costoPesos).toBeGreaterThan(0);
  });

  it("no inventa fechas: una fecha futura o mal escrita queda vacía", async () => {
    await activarModulo(e.camila.id);
    const admin = await recargar(e.ctx.admin);
    const r = await leerFacturaConFoto(admin, e.motos.id, [FOTO], lectorFalso(factura({ fecha: "2099-01-01", vencimiento: "2026-02-30" })));
    if (!r.ok) throw new Error(r.error);
    expect(r.factura.fecha).toBeNull();
    expect(r.factura.vencimiento).toBeNull();
  });

  it("una foto que no es factura cuenta para el límite y devuelve un mensaje claro", async () => {
    await activarModulo(e.camila.id);
    const admin = await recargar(e.ctx.admin);
    const r = await leerFacturaConFoto(admin, e.motos.id, [FOTO], lectorFalso(factura({ legible: false })));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no se alcanza a leer/);
    expect((await estadoFotos(admin, true)).usadas).toBe(1);
  });

  it("un error del servicio que no costó nada no cuenta para el límite", async () => {
    await activarModulo(e.camila.id);
    const admin = await recargar(e.ctx.admin);
    const caido: LectorFacturas = {
      modelo: "claude-opus-5-5",
      leer: async () => ({ ok: false, error: "El servicio no respondió.", uso: { modelo: "claude-opus-5-5", tokensEntrada: 0, tokensSalida: 0 } }),
    };
    const r = await leerFacturaConFoto(admin, e.motos.id, [FOTO], caido);
    expect(r.ok).toBe(false);
    expect((await estadoFotos(admin, true)).usadas).toBe(0);
  });

  it("respeta el límite del mes y no llama a la IA cuando se acabó", async () => {
    await activarModulo(e.camila.id, 2);
    const admin = await recargar(e.ctx.admin);
    const lector = lectorFalso(factura());
    expect((await leerFacturaConFoto(admin, e.motos.id, [FOTO], lector)).ok).toBe(true);
    expect((await leerFacturaConFoto(admin, e.motos.id, [FOTO], lector)).ok).toBe(true);
    const r = await leerFacturaConFoto(admin, e.motos.id, [FOTO], lector);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Ya se usaron/);
    expect(lector.llamadas).toBe(2);
    expect(await estadoFotos(admin, true)).toEqual({ disponible: true, usadas: 2, limite: 2 });
  });

  it("las lecturas del mes pasado no cuentan", async () => {
    await activarModulo(e.camila.id, 1);
    const admin = await recargar(e.ctx.admin);
    await prisma.lecturaFactura.create({
      data: {
        empresaId: e.camila.id,
        negocioId: e.motos.id,
        usuarioId: admin.usuarioId,
        paginas: 1,
        exito: true,
        modelo: "x",
        costoPesos: 200,
        creadoEn: new Date(inicioDelMes().getTime() - 1000),
      },
    });
    expect((await estadoFotos(admin, true)).usadas).toBe(0);
    expect((await leerFacturaConFoto(admin, e.motos.id, [FOTO], lectorFalso(factura()))).ok).toBe(true);
  });

  it("con el módulo apagado o sin clave no se lee nada", async () => {
    const lector = lectorFalso(factura());
    const r = await leerFacturaConFoto(e.ctx.admin, e.motos.id, [FOTO], lector);
    expect(r.ok).toBe(false);
    expect(lector.llamadas).toBe(0);
    expect((await estadoFotos(e.ctx.admin, true)).disponible).toBe(false);

    await activarModulo(e.camila.id);
    const admin = await recargar(e.ctx.admin);
    expect((await leerFacturaConFoto(admin, e.motos.id, [FOTO], null)).ok).toBe(false);
    expect((await estadoFotos(admin, false)).disponible).toBe(false);
  });

  it("rechaza archivos que no son fotos ni PDF, y más de 3 hojas", async () => {
    await activarModulo(e.camila.id);
    const admin = await recargar(e.ctx.admin);
    const lector = lectorFalso(factura());
    expect((await leerFacturaConFoto(admin, e.motos.id, [new Uint8Array([1, 2, 3, 4])], lector)).ok).toBe(false);
    expect((await leerFacturaConFoto(admin, e.motos.id, [FOTO, FOTO, FOTO, FOTO], lector)).ok).toBe(false);
    expect(lector.llamadas).toBe(0);
  });
});

describe("aislamiento", () => {
  it("el cajero no puede leer facturas", async () => {
    await activarModulo(e.camila.id);
    const cajero = await recargar(e.ctx.cajero);
    await expect(leerFacturaConFoto(cajero, e.motos.id, [FOTO], lectorFalso(factura()))).rejects.toThrow(AccesoDenegado);
  });

  it("el socio de la ferretería no puede leer facturas para el negocio de motos", async () => {
    await activarModulo(e.camila.id);
    const socio = await recargar(e.ctx.socio);
    await expect(leerFacturaConFoto(socio, e.motos.id, [FOTO], lectorFalso(factura()))).rejects.toThrow(AccesoDenegado);
  });

  it("solo reconoce productos y proveedores del negocio, nunca de otro negocio ni de otra empresa", async () => {
    await activarModulo(e.camila.id);
    await activarModulo(e.otra.id);
    const admin = await recargar(e.ctx.admin);
    const adminOtra = await recargar(e.ctx.adminOtra);
    // El mismo código existe en motos (Camila) y en la tienda de la otra empresa.
    await producto(e.motos.id, { codigo: "TOR-14", nombre: "Tornillo hexagonal 1/4" });
    const rOtra = await crearProducto(
      adminOtra,
      e.tiendaOtra.id,
      esquemaProducto.parse({
        codigo: "TOR-14", nombre: "Tornillo hexagonal 1/4", costo: "1", precioVenta: "2", stockMinimo: "0",
        unidad: "UNIDAD", fraccionado: false, porcentajeIva: 19, condicion: "NUEVO",
      }),
      "1",
    );
    if (!rOtra.ok) throw new Error(rOtra.error);
    await guardarProveedor(adminOtra, e.tiendaOtra.id, null, { nombre: "Distribuidora Andina", nit: "900123456" });

    const lector = lectorFalso(factura({ lineas: [linea({ codigo: "TOR-14", descripcion: "Tornillo hexagonal 1/4" })] }));
    const r = await leerFacturaConFoto(admin, e.ferreteria.id, [FOTO], lector);
    if (!r.ok) throw new Error(r.error);
    expect(r.factura.proveedor.id).toBeNull();
    expect(r.factura.lineas[0]).toMatchObject({ estado: "nuevo", producto: null, candidatos: [] });

    // Las lecturas de una empresa no cuentan para la otra.
    expect((await estadoFotos(adminOtra, true)).usadas).toBe(0);
    expect(await datosDe(adminOtra).lecturaFactura.count()).toBe(0);
    expect(await datosDe(admin).lecturaFactura.count()).toBe(1);
  });

  it("las lecturas no se pueden crear ni borrar desde la app", async () => {
    await expect(
      datosDe(e.ctx.admin).lecturaFactura.create({
        data: { negocioId: e.motos.id, usuarioId: e.ctx.admin.usuarioId, paginas: 1, modelo: "x" } as never,
      }),
    ).rejects.toThrow(AccesoDenegado);
  });
});
