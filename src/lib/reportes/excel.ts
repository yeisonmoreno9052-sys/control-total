// Un reporte a Excel: una hoja "Resumen" con las tarjetas y una hoja por tabla.
import ExcelJS from "exceljs";
import type { Reporte, TipoDato } from "./armar";

const FORMATO: Record<TipoDato, string | undefined> = {
  texto: undefined,
  pesos: '"$" #,##0;[Red]-"$" #,##0',
  numero: "#,##0.###",
  porcentaje: '0.0" %"',
};

/** Excel no acepta nombres de hoja con : \ / ? * [ ] ni de más de 31 letras, ni repetidos. */
function nombreHoja(titulo: string, usados: Set<string>) {
  const base =
    titulo
      .replace(/[:\\/?*[\]]/g, " ")
      .slice(0, 28)
      .trim() || "Hoja";
  let nombre = base;
  for (let i = 2; usados.has(nombre.toLowerCase()); i++) nombre = `${base} ${i}`;
  usados.add(nombre.toLowerCase());
  return nombre;
}

export async function reporteAExcel(reporte: Reporte, empresa: string) {
  const libro = new ExcelJS.Workbook();
  libro.creator = "Control Total · EMY TELECOM";
  libro.created = new Date();
  const usados = new Set<string>();

  const resumen = libro.addWorksheet(nombreHoja("Resumen", usados));
  resumen.columns = [{ width: 44 }, { width: 22 }];
  resumen.addRow([reporte.titulo]).font = { bold: true, size: 14 };
  resumen.addRow([`${empresa} · ${reporte.negocio}`]);
  if (reporte.periodo) resumen.addRow([reporte.periodo]);
  resumen.addRow([]);
  for (const t of reporte.tarjetas) {
    const fila = resumen.addRow([t.etiqueta, t.valor]);
    fila.getCell(2).numFmt = FORMATO[t.tipo] ?? "General";
    if (t.destacada) fila.font = { bold: true };
  }
  if (reporte.nota) {
    resumen.addRow([]);
    resumen.addRow([reporte.nota]).font = { italic: true, color: { argb: "FF666666" } };
  }

  for (const tabla of reporte.tablas) {
    const hoja = libro.addWorksheet(nombreHoja(tabla.titulo, usados));
    hoja.addRow([tabla.titulo]).font = { bold: true, size: 12 };
    hoja.addRow([`${reporte.negocio}${reporte.periodo ? ` · ${reporte.periodo}` : ""}`]);
    hoja.addRow([]);
    const encabezado = hoja.addRow(tabla.columnas.map((c) => c.titulo));
    encabezado.font = { bold: true };
    encabezado.eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF7" } };
      c.border = { bottom: { style: "thin", color: { argb: "FF9AA9C0" } } };
    });
    hoja.views = [{ state: "frozen", ySplit: 4 }];
    for (const f of tabla.filas) hoja.addRow(f);
    if (tabla.total) {
      const total = hoja.addRow(tabla.total);
      total.font = { bold: true };
      total.eachCell((c) => (c.border = { top: { style: "thin" } }));
    }
    if (!tabla.filas.length) hoja.addRow([tabla.vacia ?? "Sin datos."]);
    tabla.columnas.forEach((c, i) => {
      const columna = hoja.getColumn(i + 1);
      columna.width = c.tipo === "texto" ? (i === 0 && tabla.columnas.length > 2 ? 18 : 40) : 18;
      const formato = FORMATO[c.tipo];
      if (formato) columna.eachCell((celda, n) => n > 4 && (celda.numFmt = formato));
      if (c.tipo !== "texto") columna.alignment = { horizontal: "right" };
    });
  }

  return Buffer.from(await libro.xlsx.writeBuffer());
}
