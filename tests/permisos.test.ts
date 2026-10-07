// Revisión de permisos en el servidor (no basta con esconder botones).
//
// 1. Toda acción del servidor y toda ruta de /api empieza leyendo la sesión.
// 2. El cajero no puede hacer nada de gestión aunque llame las funciones directo.
// 3. El socio de la ferretería no puede tocar nada del negocio de motos.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AccesoDenegado } from "@/lib/datos/alcance";
import { listarCierres, reabrirCaja, verResumenDeCaja } from "@/lib/datos/caja";
import { guardarCategoria, guardarMargenNegocio } from "@/lib/datos/categorias";
import { prisma } from "@/lib/datos/cliente";
import { guardarProveedor, listarProveedores, registrarFactura } from "@/lib/datos/compras";
import { guardarLogo } from "@/lib/datos/empresa";
import { listarHistorial } from "@/lib/datos/historial";
import { analizarImportacion } from "@/lib/datos/importacion";
import { crearProducto } from "@/lib/datos/inventario";
import { listarMovimientosCaja, registrarMovimientoCaja } from "@/lib/datos/movimientos-caja";
import { inventarioValorizado, resumenVentas, utilidadDelPeriodo } from "@/lib/datos/reportes";
import { listarUsuarios } from "@/lib/datos/usuarios";
import { diaEnBogota } from "@/lib/formato";
import { crearEscenario, type Escenario } from "./escenario";

let e: Escenario;
beforeEach(async () => {
  e = await crearEscenario();
});
afterAll(() => prisma.$disconnect());

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? archivos(p) : [p];
  });
}

/** Cuerpo de cada función exportada (hasta la siguiente exportación). */
function funcionesExportadas(codigo: string) {
  const partes = codigo.split(/\nexport (?=async function|function|const)/).slice(1);
  return partes.map((p) => ({ nombre: /(?:function|const)\s+(\w+)/.exec(p)?.[1] ?? "?", cuerpo: p }));
}

// Formas válidas de leer la sesión. Los ayudantes locales (contextoVentas, negocioActivo…) llaman obtenerContexto.
const LEE_SESION =
  /obtenerContexto|obtenerContextoParaCambio|contexto[A-Z]\w*\(\)|negocioActivo\(\)|contextoAdmin\(\)|signIn\(|signOut\(/;

describe("toda entrada al servidor lee la sesión", () => {
  const raiz = path.resolve(__dirname, "../src/app");
  const todos = archivos(raiz);

  it("las acciones del servidor", () => {
    const sinSesion: string[] = [];
    let revisadas = 0;
    for (const f of todos.filter((x) => /\.tsx?$/.test(x))) {
      const codigo = readFileSync(f, "utf8");
      if (!codigo.startsWith('"use server"')) continue;
      for (const fn of funcionesExportadas(codigo)) {
        if (/^export type/.test(fn.cuerpo)) continue;
        revisadas++;
        if (!LEE_SESION.test(fn.cuerpo)) sinSesion.push(`${path.relative(raiz, f)} → ${fn.nombre}`);
      }
    }
    expect(sinSesion).toEqual([]);
    expect(revisadas).toBeGreaterThan(40);
  });

  it("las rutas de /api y demás route.ts", () => {
    // Públicas a propósito: el inicio de sesión, salir y el aviso de "hay internet".
    const publicas = ["api/auth/[...nextauth]/route.ts", "salir/route.ts", "api/caja/estado/route.ts"];
    const sinSesion = todos
      .filter((f) => f.endsWith("route.ts") && !publicas.includes(path.relative(raiz, f)))
      .filter((f) => !/obtenerContexto/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(raiz, f));
    expect(sinSesion).toEqual([]);
    expect(todos.filter((f) => f.endsWith("route.ts")).length).toBeGreaterThan(publicas.length);
  });
});

describe("el cajero no hace gestión aunque llame las funciones directo", () => {
  it("no ve cifras, costos, caja, proveedores, usuarios ni historial", async () => {
    const c = e.ctx.cajero;
    const m = e.motos.id;
    const hoy = diaEnBogota();
    const intentos: [string, () => Promise<unknown>][] = [
      ["resumen de ventas", () => resumenVentas(c, [m], hoy, hoy)],
      ["utilidad", () => utilidadDelPeriodo(c, [m], hoy, hoy)],
      ["inventario valorizado", () => inventarioValorizado(c, [m])],
      ["ingresos y egresos", () => listarMovimientosCaja(c, [m], hoy, hoy)],
      [
        "registrar egreso",
        () =>
          registrarMovimientoCaja(c, m, { categoria: "NOMINA", valor: 1000, medio: "EFECTIVO", fecha: hoy, desdeCaja: false }),
      ],
      ["cierres", () => listarCierres(c, m)],
      ["resumen del cierre", () => verResumenDeCaja(c, "x")],
      ["reabrir caja", () => reabrirCaja(c, "x")],
      ["proveedores", () => listarProveedores(c, m)],
      ["crear proveedor", () => guardarProveedor(c, m, null, { nombre: "P" })],
      ["factura de compra", () => registrarFactura(c, m, {} as never)],
      ["crear producto", () => crearProducto(c, m, {} as never, "0")],
      ["categorías", () => guardarCategoria(c, m, { nombre: "X", margenSugerido: null })],
      ["margen", () => guardarMargenNegocio(c, m, 30)],
      ["importar", () => analizarImportacion(c, m, new Uint8Array(), "x.xlsx")],
      ["logo", () => guardarLogo(c, null)],
      ["usuarios", () => listarUsuarios(c)],
      [
        "historial",
        () => listarHistorial(c, { desde: hoy, hasta: hoy, negocioId: null, usuarioId: null, grupo: null, pagina: 1 }),
      ],
    ];
    const permitidos: string[] = [];
    for (const [nombre, intento] of intentos) {
      const r = await intento().catch((error) => error);
      if (!(r instanceof AccesoDenegado)) permitidos.push(nombre);
    }
    expect(permitidos).toEqual([]);
  });
});

describe("el socio de la ferretería no toca el negocio de motos", () => {
  it("ni cifras, ni caja, ni proveedores, ni inventario, ni historial", async () => {
    const s = e.ctx.socio;
    const m = e.motos.id;
    const hoy = diaEnBogota();
    const intentos: [string, () => Promise<unknown>][] = [
      ["resumen de ventas", () => resumenVentas(s, [m], hoy, hoy)],
      ["consolidado con motos", () => resumenVentas(s, [e.ferreteria.id, m], hoy, hoy)],
      ["ingresos y egresos", () => listarMovimientosCaja(s, [m], hoy, hoy)],
      [
        "registrar egreso",
        () =>
          registrarMovimientoCaja(s, m, { categoria: "NOMINA", valor: 1000, medio: "EFECTIVO", fecha: hoy, desdeCaja: false }),
      ],
      ["cierres", () => listarCierres(s, m)],
      ["proveedores", () => listarProveedores(s, m)],
      ["crear producto", () => crearProducto(s, m, {} as never, "0")],
      ["margen", () => guardarMargenNegocio(s, m, 30)],
      [
        "historial de motos",
        () => listarHistorial(s, { desde: hoy, hasta: hoy, negocioId: m, usuarioId: null, grupo: null, pagina: 1 }),
      ],
      ["usuarios", () => listarUsuarios(s)],
      ["logo de la empresa", () => guardarLogo(s, null)],
    ];
    const permitidos: string[] = [];
    for (const [nombre, intento] of intentos) {
      const r = await intento().catch((error) => error);
      if (!(r instanceof AccesoDenegado)) permitidos.push(nombre);
    }
    expect(permitidos).toEqual([]);
  });
});
