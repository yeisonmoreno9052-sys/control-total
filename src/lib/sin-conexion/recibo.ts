// Recibo de una venta hecha sin internet. No puede usar la página /recibo (vive en el
// servidor), así que se arma aquí y se imprime desde un marco oculto. Mismo formato de 80 mm.
import { formatearFecha, formatearHora, formatearPesos } from "@/lib/formato";
import { formatearCantidad } from "@/lib/inventario/cantidades";
import { UNIDADES } from "@/lib/inventario/unidades";
import type { UnidadMedida } from "@/generated/prisma/enums";
import type { DatosRecibo, ReciboLocal } from "./almacen";

const escapar = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const fila = (nombre: string, valor: number) =>
  `<div class="f"><span>${escapar(nombre)}</span><span>${formatearPesos(valor)}</span></div>`;

export function htmlRecibo(numeroProvisional: string, creadaEn: string, r: ReciboLocal, negocio: DatosRecibo | null) {
  const fecha = new Date(creadaEn);
  const porTarifa = new Map<number, { base: number; iva: number }>();
  for (const l of r.lineas) {
    const t = porTarifa.get(l.porcentajeIva) ?? { base: 0, iva: 0 };
    porTarifa.set(l.porcentajeIva, { base: t.base + l.base, iva: t.iva + l.iva });
  }
  const NOMBRE_MEDIO = { EFECTIVO: "Efectivo", TRANSFERENCIA: "Transferencia" };
  const efectivo = r.pagos.find((p) => p.medio === "EFECTIVO")?.valor;

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Recibo ${escapar(numeroProvisional)}</title>
<style>
@page { size: 80mm auto; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; padding: 5mm 4mm; width: 80mm; font: 12px/1.35 system-ui, sans-serif; color: #000; }
.c { text-align: center; } .b { font-weight: 700; } .g { font-size: 15px; } .p { font-size: 10px; }
.f { display: flex; justify-content: space-between; gap: 8px; font-variant-numeric: tabular-nums; }
.t { font-size: 16px; font-weight: 700; } hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
.aviso { border: 2px solid #000; padding: 3px; text-align: center; margin: 6px 0; font-weight: 700; }
img { display: block; margin: 0 auto 4px; max-height: 16mm; max-width: 50mm; object-fit: contain; }
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; } td, th { padding: 0; } .d { text-align: right; }
p { margin: 0; } li { list-style: none; margin-bottom: 4px; } ul { margin: 0; padding: 0; }
</style></head><body>
<header class="c">
${negocio?.logo ? `<img src="${negocio.logo}" alt="">` : ""}
<p class="b g">${escapar(negocio?.nombre ?? "")}</p>
${negocio?.razonSocial ? `<p>${escapar(negocio.razonSocial)}</p>` : ""}
${negocio?.nit || negocio?.regimen ? `<p>${escapar([negocio.nit && `NIT ${negocio.nit}`, negocio.regimen].filter(Boolean).join(" · "))}</p>` : ""}
${negocio?.direccion ? `<p>${escapar(negocio.direccion)}</p>` : ""}
${negocio?.telefono ? `<p>Tel. ${escapar(negocio.telefono)}</p>` : ""}
</header>
<hr>
<p class="b">Recibo provisional Nº ${escapar(numeroProvisional)}</p>
<p>${formatearFecha(fecha)} ${formatearHora(fecha)} · Atendió: ${escapar(r.vendedor)}</p>
${r.cliente ? `<p>Cliente: ${escapar(r.cliente)}</p>` : ""}
<div class="aviso">Venta sin internet. El número definitivo se asigna al subirla.</div>
<hr>
<ul>
${r.lineas
  .map(
    (l) =>
      `<li><p>${escapar(l.nombre)}</p><div class="f"><span>${formatearCantidad(l.cantidad)} ${UNIDADES[l.unidad as UnidadMedida]?.corto ?? ""} × ${formatearPesos(l.precioUnitario)}${l.porcentajeIva ? "" : " (sin IVA)"}</span><span>${formatearPesos(l.subtotal)}</span></div>${l.descuento > 0 ? fila("Descuento", -l.descuento) : ""}</li>`,
  )
  .join("")}
</ul>
<hr>
${fila("Subtotal", r.subtotal)}
${r.descuento > 0 ? fila("Descuentos", -r.descuento) : ""}
<div class="f t"><span>TOTAL</span><span>${formatearPesos(r.total)}</span></div>
<hr>
<table><thead><tr><th style="text-align:left">IVA</th><th class="d">Base</th><th class="d">Impuesto</th></tr></thead><tbody>
${[...porTarifa]
  .sort(([a], [b]) => b - a)
  .map(
    ([tarifa, t]) =>
      `<tr><td>${tarifa} %</td><td class="d">${formatearPesos(t.base)}</td><td class="d">${formatearPesos(t.iva)}</td></tr>`,
  )
  .join("")}
</tbody></table>
<hr>
${r.pagos.map((p) => fila(`${NOMBRE_MEDIO[p.medio]}${p.referencia ? ` (${p.referencia})` : ""}`, p.valor)).join("")}
${r.recibido !== null && r.recibido !== efectivo ? fila("Recibido en efectivo", r.recibido) : ""}
${r.cambio ? fila("Cambio", r.cambio) : ""}
<hr>
<footer class="c">
${negocio?.mensajeRecibo ? `<p class="b">${escapar(negocio.mensajeRecibo)}</p>` : ""}
<p class="p">Este recibo no es una factura electrónica.</p>
<p class="p">Desarrollado por EMY TELECOM</p>
</footer>
</body></html>`;
}

/** Imprime un HTML desde un marco oculto (funciona sin internet). */
export function imprimirHtml(html: string) {
  const marco = document.createElement("iframe");
  marco.setAttribute("aria-hidden", "true");
  marco.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(marco);
  marco.onload = () => {
    const ventana = marco.contentWindow;
    if (!ventana) return;
    ventana.focus();
    ventana.print();
    setTimeout(() => marco.remove(), 60_000);
  };
  marco.srcdoc = html;
}
