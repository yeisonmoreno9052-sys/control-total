// Convierte un registro de auditoría en una frase que cualquiera entiende:
// "anuló la venta #152 por $ 45.000" + "Motivo: el cliente se arrepintió".
import { formatearPesos } from "@/lib/formato";
import { MOTIVOS_AJUSTE } from "@/lib/inventario/unidades";

export type GrupoHistorial = "ventas" | "inventario" | "compras" | "caja" | "usuarios" | "configuracion";

export const GRUPOS_HISTORIAL: Record<GrupoHistorial, { nombre: string; acciones: string[] }> = {
  ventas: { nombre: "Ventas", acciones: ["ANULACION_VENTA", "DEVOLUCION_VENTA", "VENTA_SIN_CONEXION"] },
  inventario: { nombre: "Inventario y precios", acciones: ["AJUSTE_STOCK", "CAMBIO_PRECIO", "IMPORTACION"] },
  compras: { nombre: "Compras", acciones: ["REGISTRO_COMPRA", "ANULACION_COMPRA", "ANULACION_ABONO"] },
  caja: { nombre: "Caja", acciones: ["REABRIR_CAJA", "ANULACION_MOVIMIENTO_CAJA"] },
  usuarios: {
    nombre: "Usuarios y contraseñas",
    acciones: [
      "CREACION_USUARIO",
      "EDICION_USUARIO",
      "ACTIVACION_USUARIO",
      "DESACTIVACION_USUARIO",
      "RESTABLECER_CONTRASENA",
      "CAMBIO_CONTRASENA",
      "BLOQUEO_INGRESO",
    ],
  },
  configuracion: { nombre: "Configuración", acciones: ["CAMBIO_DATOS_NEGOCIO", "CAMBIO_LOGO"] },
};

const NOMBRES_ROL: Record<string, string> = { ADMINISTRADOR: "Administrador", SOCIO: "Socio", CAJERO: "Cajero" };

const NOMBRES_CAMPO: Record<string, string> = {
  nombre: "nombre",
  razonSocial: "razón social",
  nit: "NIT",
  regimen: "régimen",
  direccion: "dirección",
  telefono: "teléfono",
  mensajeRecibo: "mensaje del recibo",
};

const CATEGORIAS: Record<string, string> = {
  NOMINA: "nómina",
  ARRIENDO: "arriendo",
  SERVICIOS: "servicios públicos",
  TRANSPORTE: "transporte",
  INSUMOS: "insumos",
  IMPUESTOS: "impuestos",
  RETIRO_DUENO: "retiro del dueño",
  OTRO_EGRESO: "otro egreso",
  APORTE: "aporte",
  OTRO_INGRESO: "otro ingreso",
};

export type Descripcion = { frase: string; detalle?: string };

type D = Record<string, unknown>;
const texto = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const pesos = (v: unknown) => (typeof v === "number" ? formatearPesos(v) : "");
const cantidad = (v: unknown) => texto(v).replace(".", ",");
const motivo = (v: unknown) => (texto(v) ? `Motivo: ${texto(v)}` : undefined);
const cuenta = (n: unknown, uno: string, varios: string) => `${Number(n) || 0} ${Number(n) === 1 ? uno : varios}`;
const lista = (v: unknown) => (Array.isArray(v) ? v.map(texto).join(", ") : texto(v));
const rol = (v: unknown) => NOMBRES_ROL[texto(v)] ?? texto(v);

/**
 * @param producto nombre del producto cuando el registro es de un producto (se busca aparte).
 * @param verCostos el cajero nunca ve costos; aquí solo entran administrador y socio, pero por si acaso.
 */
export function describirAuditoria(
  accion: string,
  detalle: unknown,
  opciones: { producto?: string | null; verCostos?: boolean } = {},
): Descripcion {
  const d = (detalle && typeof detalle === "object" ? detalle : {}) as D;
  const producto = opciones.producto ?? (texto(d.codigo) ? `el producto ${texto(d.codigo)}` : "un producto");

  switch (accion) {
    case "ANULACION_VENTA":
      return { frase: `anuló la venta #${texto(d.consecutivo)} por ${pesos(d.total)}`, detalle: motivo(d.motivo) };
    case "DEVOLUCION_VENTA":
      return {
        frase: `registró una devolución de ${pesos(d.total)} en la venta #${texto(d.venta)}`,
        detalle: motivo(d.motivo),
      };
    case "VENTA_SIN_CONEXION": {
      const avisos = [
        d.preciosDistintos ? "se vendió con precios que ya habían cambiado" : "",
        d.negativos ? "dejó productos con stock negativo" : "",
      ].filter(Boolean);
      return {
        frase: `subió la venta #${texto(d.consecutivo)}, hecha sin internet`,
        detalle: avisos.length ? `Ojo: ${avisos.join(" y ")}.` : undefined,
      };
    }
    case "REABRIR_CAJA":
      return {
        frase: "reabrió la caja después de cerrarla",
        detalle: typeof d.contadoAntes === "number" ? `Al cerrar se habían contado ${pesos(d.contadoAntes)}.` : undefined,
      };
    case "AJUSTE_STOCK":
      return {
        frase: `ajustó el stock de ${producto} de ${cantidad(d.antes)} a ${cantidad(d.despues)}`,
        detalle:
          [MOTIVOS_AJUSTE[texto(d.motivo) as keyof typeof MOTIVOS_AJUSTE] ?? texto(d.motivo), texto(d.nota)]
            .filter(Boolean)
            .join(" · ") || undefined,
      };
    case "CAMBIO_PRECIO": {
      // Desde la ficha del producto: { costo: {antes, despues}, precioVenta: {antes, despues} }.
      // Desde una factura de compra: { antes, despues, motivo }.
      if (typeof d.antes === "number") {
        return {
          frase: `cambió el precio de ${producto} de ${pesos(d.antes)} a ${pesos(d.despues)}`,
          detalle: texto(d.motivo) || undefined,
        };
      }
      const precio = (d.precioVenta ?? {}) as D;
      const costo = (d.costo ?? {}) as D;
      const cambiaPrecio = precio.antes !== precio.despues;
      const cambiaCosto = costo.antes !== costo.despues && opciones.verCostos !== false;
      const frase = cambiaPrecio
        ? `cambió el precio de ${producto} de ${pesos(precio.antes)} a ${pesos(precio.despues)}`
        : `cambió el costo de ${producto}`;
      return {
        frase,
        detalle: cambiaCosto ? `Costo: de ${pesos(costo.antes)} a ${pesos(costo.despues)}` : undefined,
      };
    }
    case "IMPORTACION":
      return {
        frase: `importó productos desde "${texto(d.archivo)}"`,
        detalle: `${cuenta(d.nuevos, "nuevo", "nuevos")}, ${cuenta(d.actualizados, "actualizado", "actualizados")}`,
      };
    case "REGISTRO_COMPRA":
      return {
        frase: `registró la factura ${texto(d.numero)} de ${texto(d.proveedor)} por ${pesos(d.total)}`,
        detalle: cuenta(d.lineas, "producto", "productos"),
      };
    case "ANULACION_COMPRA":
      return { frase: `anuló la factura de compra ${texto(d.numero)} por ${pesos(d.total)}`, detalle: motivo(d.motivo) };
    case "ANULACION_ABONO":
      return { frase: `anuló un abono de ${pesos(d.valor)} a la factura ${texto(d.factura)}` };
    case "ANULACION_MOVIMIENTO_CAJA":
      return {
        frase: `anuló un registro de ${CATEGORIAS[texto(d.categoria)] ?? "caja"} por ${pesos(d.valor)}`,
        detalle: motivo(d.motivo),
      };
    case "CREACION_USUARIO":
      return {
        frase: `creó el usuario ${texto(d.nombre)} (${texto(d.usuario)})`,
        detalle: `${rol(d.rol)} · ${lista(d.negocios)}`,
      };
    case "EDICION_USUARIO": {
      const antes = (d.antes ?? {}) as D;
      const despues = (d.despues ?? {}) as D;
      const cambios = [
        antes.nombre !== despues.nombre ? `nombre: ${texto(antes.nombre)} → ${texto(despues.nombre)}` : "",
        antes.rol !== despues.rol ? `rol: ${rol(antes.rol)} → ${rol(despues.rol)}` : "",
        lista(antes.negocios) !== lista(despues.negocios)
          ? `negocios: ${lista(antes.negocios) || "ninguno"} → ${lista(despues.negocios) || "ninguno"}`
          : "",
      ].filter(Boolean);
      return {
        frase: `cambió los permisos de ${texto(d.nombre)}`,
        detalle: cambios.length ? cambios.join(" · ") : "Sin cambios.",
      };
    }
    case "ACTIVACION_USUARIO":
      return { frase: `volvió a activar a ${texto(d.nombre)}` };
    case "DESACTIVACION_USUARIO":
      return { frase: `desactivó a ${texto(d.nombre)}`, detalle: "Ya no puede entrar al sistema." };
    case "RESTABLECER_CONTRASENA":
      return { frase: `le puso una contraseña temporal a ${texto(d.nombre)}` };
    case "CAMBIO_CONTRASENA":
      return { frase: "cambió su contraseña" };
    case "BLOQUEO_INGRESO":
      return {
        frase: `quedó bloqueado ${texto(d.minutos)} minutos`,
        detalle: `Se equivocó ${texto(d.intentos)} veces seguidas en la contraseña.`,
      };
    case "CAMBIO_DATOS_NEGOCIO": {
      const campos = Object.keys((d.cambios ?? {}) as D).map((c) => NOMBRES_CAMPO[c] ?? c);
      return {
        frase: `cambió los datos de ${texto(d.negocio)}`,
        detalle: campos.length ? `Cambió: ${campos.join(", ")}` : undefined,
      };
    }
    case "CAMBIO_LOGO":
      return { frase: d.quitado ? "quitó el logo" : "cambió el logo" };
    default:
      return { frase: accion.toLowerCase().replaceAll("_", " ") };
  }
}
