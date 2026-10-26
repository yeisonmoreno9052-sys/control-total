// Lector de facturas con la API de Anthropic (Claude). Corre solo en el servidor:
// la clave nunca llega al navegador.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { esquemaFacturaLeida } from "./factura";
import type { ArchivoFactura, LectorFacturas, ResultadoLector } from "./lector";

const INSTRUCCIONES = `Lees facturas de compra de comercios pequeños en Colombia (repuestos de moto, ferreterías) para registrarlas en un inventario.
Te llegan una o varias fotos o un PDF de la MISMA factura (pueden ser varias hojas). Devuelve sus datos.

Reglas:
- Los números colombianos usan punto para miles y coma para decimales: "1.250.000" son 1250000 pesos y "2,5" son 2.5. Devuelve los números sin separadores de miles, con punto decimal.
- Los valores en pesos van sin decimales (redondea al peso).
- Una línea por cada producto, en el orden de la factura. No inventes productos ni líneas; si una línea está tachada o dice "faltó"/"agotado", no la incluyas y menciónalo en "nota".
- "valorUnitario" es el valor de UNA unidad. Si la factura solo trae el total de la línea, divídelo por la cantidad. Si hay descuento por línea, pon el valor antes del descuento y el porcentaje en "descuentoPorcentaje".
- "incluyeIva": true si el valor unitario ya trae el IVA (factura de régimen simple, "IVA incluido", o no discrimina IVA). false si el IVA se suma aparte.
- "codigo" es la referencia del proveedor o del producto; "codigoBarras" solo si se ve un código EAN/UPC de 8 a 14 dígitos.
- "unidad": como aparece (UND, MT, KG, GL, CAJA...). null si no dice.
- NIT sin puntos ni espacios, con el dígito de verificación separado por guion si aparece (ej. 900123456-7).
- Fechas en formato AAAA-MM-DD. Si el año viene con dos dígitos, es 20XX.
- "formaPago": "credito" si dice crédito o trae fecha de vencimiento; "contado" si dice contado o efectivo; si no, "desconocida".
- "total": el valor total a pagar de la factura.
- Si algo no se lee con seguridad, pon tu mejor lectura y explícalo en "nota". Si la imagen no es una factura o no se puede leer, pon "legible": false.`;

export class LectorAnthropic implements LectorFacturas {
  modelo = process.env.ANTHROPIC_MODELO || "claude-opus-5-5";
  private cliente = new Anthropic({ timeout: 120_000, maxRetries: 2 });

  async leer(archivos: ArchivoFactura[]): Promise<ResultadoLector> {
    const sinUso = { modelo: this.modelo, tokensEntrada: 0, tokensSalida: 0 };
    const contenido: Anthropic.Beta.BetaContentBlockParam[] = archivos.map((a) => {
      const data = Buffer.from(a.datos).toString("base64");
      return a.tipo === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
        : { type: "image", source: { type: "base64", media_type: a.tipo, data } };
    });
    contenido.push({
      type: "text",
      text: archivos.length > 1 ? `Son ${archivos.length} hojas de la misma factura.` : "Lee esta factura.",
    });

    try {
      const respuesta = await this.cliente.beta.messages.parse({
        model: this.modelo,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: INSTRUCCIONES,
        messages: [{ role: "user", content: contenido }],
        output_config: {
          // Leer una factura no necesita pensar mucho; "low" mantiene el costo bajo.
          effort: (process.env.ANTHROPIC_ESFUERZO as "low" | "medium" | "high" | undefined) || "low",
          format: betaZodOutputFormat(esquemaFacturaLeida),
        },
      });
      const uso = {
        modelo: respuesta.model || this.modelo,
        tokensEntrada:
          respuesta.usage.input_tokens +
          (respuesta.usage.cache_creation_input_tokens ?? 0) +
          (respuesta.usage.cache_read_input_tokens ?? 0),
        tokensSalida: respuesta.usage.output_tokens,
      };
      if (respuesta.stop_reason === "refusal") {
        return { ok: false, error: "No pudimos leer esta factura. Regístrala a mano.", uso };
      }
      if (respuesta.stop_reason === "max_tokens") {
        return { ok: false, error: "La factura es demasiado larga para leerla de una vez. Sube las hojas por separado.", uso };
      }
      const factura = respuesta.parsed_output;
      if (!factura) return { ok: false, error: "No pudimos entender la factura. Toma la foto de nuevo, con buena luz.", uso };
      return { ok: true, factura, uso };
    } catch (error) {
      console.error("Error leyendo factura con IA:", error);
      if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
        return { ok: false, error: "La lectura con foto no está bien configurada. Avísale a EMY TELECOM.", uso: sinUso };
      }
      if (error instanceof Anthropic.RateLimitError) {
        return { ok: false, error: "Hay muchas lecturas al mismo tiempo. Intenta de nuevo en un minuto.", uso: sinUso };
      }
      if (error instanceof Anthropic.BadRequestError) {
        return { ok: false, error: "No pudimos leer ese archivo. Prueba con otra foto o un PDF más liviano.", uso: sinUso };
      }
      return { ok: false, error: "El servicio de lectura no respondió. Intenta de nuevo en un momento.", uso: sinUso };
    }
  }
}
