// Puerta única hacia la IA que lee facturas. El resto de la app solo conoce
// esta interfaz, así se puede cambiar de proveedor sin tocar nada más.
import "server-only";
import type { FacturaLeida } from "./factura";

export type ArchivoFactura = { tipo: "image/jpeg" | "image/png" | "image/webp" | "application/pdf"; datos: Uint8Array };

export type ResultadoLector =
  | {
      ok: true;
      factura: FacturaLeida;
      uso: { modelo: string; tokensEntrada: number; tokensSalida: number };
    }
  | {
      ok: false;
      /** Mensaje para la persona, en lenguaje humano. */
      error: string;
      uso: { modelo: string; tokensEntrada: number; tokensSalida: number };
    };

export interface LectorFacturas {
  modelo: string;
  leer(archivos: ArchivoFactura[]): Promise<ResultadoLector>;
}

/** El lector configurado, o null si falta la clave (el botón no aparece). */
export async function obtenerLector(): Promise<LectorFacturas | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const { LectorAnthropic } = await import("./anthropic");
  return new LectorAnthropic();
}

export function hayLector() {
  return !!process.env.ANTHROPIC_API_KEY;
}
