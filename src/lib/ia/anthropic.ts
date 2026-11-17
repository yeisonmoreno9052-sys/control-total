// Lector de facturas con la API de Anthropic (Claude). Corre solo en el servidor:
// la clave nunca llega al navegador.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { esquemaFacturaLeida } from "./factura";
import type { ArchivoFactura, LectorFacturas, LectorProductos, ResultadoLector, ResultadoProductos } from "./lector";
import { esquemaProductosLeidos } from "./productos";

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

const INSTRUCCIONES_PRODUCTOS = `Ayudas a cargar el inventario de comercios pequeños en Colombia (cafeterías, tiendas, ferreterías, repuestos).
Te llegan varias fotos numeradas. Normalmente cada foto muestra UN producto (un paquete, una botella, una caja). A veces una foto muestra un menú, un tablero de precios o una estantería con varios productos distintos: entonces devuelve uno por cada producto distinto que se vea.

Reglas:
- "foto": el número de la foto de donde sale el producto (1 = la primera).
- "nombre": como se vende en el mostrador, corto y claro, en español: tipo de producto, marca, sabor o variedad y tamaño. Ej.: "Gaseosa Coca-Cola 400 ml", "Galletas Festival fresa x6", "Agua Cristal 600 ml", "Empanada de carne". Sin palabras de relleno ni mayúsculas sostenidas.
- Si dos fotos muestran el MISMO producto (misma marca, sabor y tamaño), devuélvelo una sola vez.
- "codigoBarras": solo si se leen con claridad todos los dígitos de un código EAN/UPC (8 a 14 dígitos). Si no, null. Nunca lo inventes.
- "precio": solo si en la foto se ve el precio de venta (etiqueta, menú o tablero), en pesos sin separadores ("$ 3.500" son 3500). El precio sugerido impreso por el fabricante también sirve. Si no se ve, null.
- "cantidad": cuántas unidades iguales se cuentan con seguridad en la foto (ej. 6 botellas en la nevera). Si es una sola o no se puede contar, null.
- "categoria": una categoría corta para agruparlo ("Bebidas frías", "Paquetes y snacks", "Panadería", "Lácteos"). Si alguna de las categorías que ya tiene el negocio sirve, usa exactamente ese nombre.
- "soloEsteProducto": true si la foto muestra sobre todo ese producto (sirve como foto de su botón en la caja); false si es un menú, una lista o una foto con varios productos.
- Si una foto no muestra ningún producto o no se entiende, no la uses y dilo en "nota" (ej. "La foto 3 está borrosa").`;

export class LectorAnthropic implements LectorFacturas, LectorProductos {
  modelo = process.env.ANTHROPIC_MODELO || "claude-opus-5-5";
  private cliente = new Anthropic({ timeout: 120_000, maxRetries: 2 });

  async leerProductos(fotos: ArchivoFactura[], categorias: string[]): Promise<ResultadoProductos> {
    const sinUso = { modelo: this.modelo, tokensEntrada: 0, tokensSalida: 0 };
    const contenido: Anthropic.Beta.BetaContentBlockParam[] = [];
    fotos.forEach((f, i) => {
      contenido.push({ type: "text", text: `Foto ${i + 1}:` });
      const data = Buffer.from(f.datos).toString("base64");
      contenido.push(
        f.tipo === "application/pdf"
          ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
          : { type: "image", source: { type: "base64", media_type: f.tipo, data } },
      );
    });
    contenido.push({
      type: "text",
      text: categorias.length
        ? `Categorías que ya tiene el negocio: ${categorias.slice(0, 80).join(", ")}.`
        : "El negocio todavía no tiene categorías.",
    });
    try {
      const respuesta = await this.cliente.beta.messages.parse({
        model: this.modelo,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: INSTRUCCIONES_PRODUCTOS,
        messages: [{ role: "user", content: contenido }],
        output_config: {
          effort: (process.env.ANTHROPIC_ESFUERZO as "low" | "medium" | "high" | undefined) || "low",
          format: betaZodOutputFormat(esquemaProductosLeidos),
        },
      });
      const uso = usoDe(respuesta, this.modelo);
      if (respuesta.stop_reason === "refusal") return { ok: false, error: "No pudimos leer estas fotos. Prueba con otras.", uso };
      if (respuesta.stop_reason === "max_tokens") {
        return { ok: false, error: "Son demasiados productos para leerlos de una vez. Sube menos fotos.", uso };
      }
      const leidos = respuesta.parsed_output;
      if (!leidos) return { ok: false, error: "No pudimos entender las fotos. Tómalas de nuevo, con buena luz.", uso };
      return { ok: true, leidos, uso };
    } catch (error) {
      console.error("Error leyendo productos con IA:", error);
      return { ok: false, error: mensajeDeFallo(error, "estas fotos"), uso: sinUso };
    }
  }

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

function usoDe(respuesta: { model?: string; usage: Anthropic.Beta.BetaUsage }, modelo: string) {
  return {
    modelo: respuesta.model || modelo,
    tokensEntrada:
      respuesta.usage.input_tokens + (respuesta.usage.cache_creation_input_tokens ?? 0) + (respuesta.usage.cache_read_input_tokens ?? 0),
    tokensSalida: respuesta.usage.output_tokens,
  };
}

function mensajeDeFallo(error: unknown, que: string) {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return "La lectura con foto no está bien configurada. Avísale a EMY TELECOM.";
  }
  if (error instanceof Anthropic.RateLimitError) return "Hay muchas lecturas al mismo tiempo. Intenta de nuevo en un minuto.";
  if (error instanceof Anthropic.BadRequestError) return `No pudimos leer ${que}. Prueba con otras fotos.`;
  return "El servicio de lectura no respondió. Intenta de nuevo en un momento.";
}
