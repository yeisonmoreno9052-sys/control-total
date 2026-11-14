// Solo en el navegador: dibuja la imagen del Estado de WhatsApp (1080 × 1920) en un canvas.
// El navegador hace todo: no se sube nada al servidor y la imagen sale al instante.
import { formatearPesos } from "@/lib/formato";
import type { Paleta } from "@/lib/paletas";
import { hayPromocion, porcentajeRebaja, rejillaCollage, type DisenoCollage, type DisenoPieza } from "./piezas";

export const ANCHO = 1080;
export const ALTO = 1920;

type Colores = {
  fondo: string;
  brillo: string;
  /** Degradado del dorado (o del color de la marca): claro, medio, oscuro. */
  acento: [string, string, string];
  suave: string;
  tenue: string;
  tarjeta: string;
  borde: string;
  /** Fondo detrás de la prenda cuando no hay foto. */
  fotoFondo: [string, string];
};

/** Los colores siguen la paleta de la empresa (negro y dorado para la tienda de ropa). */
export const COLORES: Record<Paleta, Colores> = {
  dorado: {
    fondo: "#0d0d0d",
    brillo: "#2a2214",
    acento: ["#f1d48a", "#d4a843", "#a87b26"],
    suave: "#b9ab8c",
    tenue: "#8a7a55",
    tarjeta: "#17140f",
    borde: "#3b3120",
    fotoFondo: ["#fbf6ee", "#e7d4b6"],
  },
  cafe: {
    fondo: "#140d08",
    brillo: "#3a2414",
    acento: ["#f3d2a6", "#d39a5a", "#9a5b22"],
    suave: "#cbb59d",
    tenue: "#9a8068",
    tarjeta: "#21160e",
    borde: "#4a3322",
    fotoFondo: ["#fbf5ee", "#ecd9c3"],
  },
  indigo: {
    fondo: "#0d1029",
    brillo: "#252a66",
    acento: ["#dedbff", "#a39bff", "#6d5ef0"],
    suave: "#b3b6da",
    tenue: "#7e82b0",
    tarjeta: "#161a3d",
    borde: "#2e3470",
    fotoFondo: ["#f6f6ff", "#dfe0f5"],
  },
};

export type Fuentes = { titulo: string; texto: string };

export type Recursos = { logo: HTMLImageElement | null; marca: string };

const VERDE_WHATSAPP = "#1f9d55";
const ICONO_WHATSAPP =
  "M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3a.5.5 0 0 0 0-.4l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7a2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z";

/** Carga una imagen del mismo sitio (foto o logo). null si no hay o no carga. */
export function cargarImagen(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((listo) => {
    const img = new Image();
    img.onload = () => listo(img);
    img.onerror = () => listo(null);
    img.src = url;
  });
}

type C = CanvasRenderingContext2D;

function espaciado(c: C, px: number) {
  // letterSpacing no existe en navegadores viejos: ahí simplemente sale sin espacio.
  (c as C & { letterSpacing?: string }).letterSpacing = `${px}px`;
}

function degradadoAcento(c: C, col: Colores, y: number, alto: number) {
  const g = c.createLinearGradient(0, y, 0, y + alto);
  g.addColorStop(0, col.acento[0]);
  g.addColorStop(0.55, col.acento[1]);
  g.addColorStop(1, col.acento[2]);
  return g;
}

function rectRedondo(c: C, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

/** Dibuja la imagen cubriendo el cuadro (recorta lo que sobra, como object-fit: cover). */
function dibujarCubriendo(c: C, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const escala = Math.max(w / img.width, h / img.height);
  const sw = w / escala;
  const sh = h / escala;
  c.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

/** Corta el texto en líneas que quepan en el ancho; si sobra, la última termina en "…". */
function partirLineas(c: C, texto: string, ancho: number, maxLineas: number) {
  const palabras = texto.trim().split(/\s+/);
  const lineas: string[] = [];
  let actual = "";
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (c.measureText(prueba).width <= ancho || !actual) actual = prueba;
    else {
      lineas.push(actual);
      actual = p;
    }
  }
  if (actual) lineas.push(actual);
  if (lineas.length > maxLineas) {
    const cortadas = lineas.slice(0, maxLineas);
    let ultima = cortadas[maxLineas - 1];
    while (ultima.length > 1 && c.measureText(`${ultima}…`).width > ancho) ultima = ultima.slice(0, -1);
    cortadas[maxLineas - 1] = `${ultima.trimEnd()}…`;
    return cortadas;
  }
  return lineas;
}

/** Busca el tamaño de letra más grande (hasta "maximo") en que el texto quepa en las líneas dadas. */
function ajustarTexto(
  c: C,
  texto: string,
  fuente: (px: number) => string,
  ancho: number,
  maximo: number,
  minimo: number,
  maxLineas: number,
) {
  for (let px = maximo; px >= minimo; px -= 4) {
    c.font = fuente(px);
    const lineas = partirLineas(c, texto, ancho, 99);
    if (lineas.length <= maxLineas && lineas.every((l) => c.measureText(l).width <= ancho)) return { px, lineas };
  }
  c.font = fuente(minimo);
  return { px: minimo, lineas: partirLineas(c, texto, ancho, maxLineas) };
}

function recortarUnaLinea(c: C, texto: string, ancho: number) {
  return partirLineas(c, texto.replace(/\s+/g, " "), ancho, 1)[0] ?? "";
}

function fondoOscuro(c: C, col: Colores) {
  c.fillStyle = col.fondo;
  c.fillRect(0, 0, ANCHO, ALTO);
  const g = c.createRadialGradient(ANCHO / 2, 0, 0, ANCHO / 2, 0, ALTO * 0.6);
  g.addColorStop(0, col.brillo);
  g.addColorStop(1, col.fondo);
  c.fillStyle = g;
  c.fillRect(0, 0, ANCHO, ALTO);
}

function logoArriba(c: C, r: Recursos, col: Colores, f: Fuentes, lado: number, y = 70) {
  if (r.logo) {
    c.save();
    c.shadowColor = "rgba(0,0,0,.45)";
    c.shadowBlur = 40;
    c.shadowOffsetY = 10;
    const escala = Math.min(lado / r.logo.width, lado / r.logo.height);
    const w = r.logo.width * escala;
    const h = r.logo.height * escala;
    c.drawImage(r.logo, (ANCHO - w) / 2, y + (lado - h) / 2, w, h);
    c.restore();
    return;
  }
  // Sin logo: el nombre del negocio en letras grandes.
  c.textAlign = "center";
  c.textBaseline = "middle";
  const { px, lineas } = ajustarTexto(c, r.marca, (p) => `700 ${p}px ${f.titulo}`, 900, 80, 44, 2);
  c.fillStyle = degradadoAcento(c, col, y, lado);
  lineas.forEach((l, i) => c.fillText(l, ANCHO / 2, y + lado / 2 + (i - (lineas.length - 1) / 2) * px * 1.1));
}

function botonWhatsApp(c: C, telefono: string, f: Fuentes, y: number) {
  const alto = 120;
  rectRedondo(c, 70, y, ANCHO - 140, alto, alto / 2);
  c.fillStyle = VERDE_WHATSAPP;
  c.fill();
  c.font = `700 44px ${f.texto}`;
  espaciado(c, 0);
  const texto = recortarUnaLinea(c, `Escríbenos al ${telefono}`, ANCHO - 140 - 160);
  const anchoTexto = c.measureText(texto).width;
  const icono = 62;
  const x0 = (ANCHO - (icono + 22 + anchoTexto)) / 2;
  c.save();
  c.translate(x0, y + (alto - icono) / 2);
  c.scale(icono / 24, icono / 24);
  c.fillStyle = "#fff";
  c.fill(new Path2D(ICONO_WHATSAPP));
  c.restore();
  c.fillStyle = "#fff";
  c.textAlign = "left";
  c.textBaseline = "middle";
  c.fillText(texto, x0 + icono + 22, y + alto / 2 + 2);
}

function piePagina(c: C, r: Recursos, col: Colores, f: Fuentes) {
  c.font = `600 26px ${f.texto}`;
  espaciado(c, 6);
  c.fillStyle = col.tenue;
  c.textAlign = "center";
  c.textBaseline = "alphabetic";
  c.fillText(recortarUnaLinea(c, r.marca.toUpperCase(), 960), ANCHO / 2, ALTO - 46);
  espaciado(c, 0);
}

/** Medidas de los círculos de tallas; si son muchas o largas, se achican y bajan a otra fila. */
function medirTallas(c: C, tallas: string[], f: Fuentes) {
  for (const px of [44, 38, 32]) {
    c.font = `700 ${px}px ${f.texto}`;
    const alto = Math.round(px * 2.2);
    const anchos = tallas.map((t) => Math.max(alto, c.measureText(t).width + px * 1.1));
    const filas: number[][] = [[]];
    let usado = 0;
    anchos.forEach((w, i) => {
      if (usado + w > 940 && filas[filas.length - 1].length) {
        filas.push([]);
        usado = 0;
      }
      filas[filas.length - 1].push(i);
      usado += w + 22;
    });
    if (filas.length <= 2 || px === 32) return { px, alto, anchos, filas: filas.slice(0, 2) };
  }
  throw new Error("inalcanzable");
}

/** Imagen de una sola prenda: foto grande, nombre, tallas, precio y teléfono. */
export function dibujarPieza(c: C, d: DisenoPieza, foto: HTMLImageElement | null, r: Recursos, col: Colores, f: Fuentes) {
  c.clearRect(0, 0, ANCHO, ALTO);
  fondoOscuro(c, col);
  const centro = ANCHO / 2;

  const rebaja = d.oferta ? porcentajeRebaja(d.precio, d.oferta) : null;
  // Bloque de texto: primero se mide y luego se dibuja.
  const fuenteNombre = (px: number) => `700 ${px}px ${f.titulo}`;
  const nombre = ajustarTexto(c, d.nombre.trim() || "Nombre de la prenda", fuenteNombre, 960, 104, 60, 2);
  const altoNombre = nombre.lineas.length * nombre.px * 1.08;
  const detalle = d.detalle.trim();
  const tallas = d.tallas.length ? medirTallas(c, d.tallas, f) : null;
  const precioFinal = rebaja ? d.oferta! : d.precio;
  const fuentePrecio = (px: number) => `700 ${px}px ${f.titulo}`;
  const precio = ajustarTexto(c, formatearPesos(precioFinal), fuentePrecio, 960, 150, 90, 1);

  const bloque =
    altoNombre +
    (detalle ? 18 + 46 : 0) +
    (tallas ? 34 + 2 + 34 + 34 + 22 + tallas.filas.length * tallas.alto + (tallas.filas.length - 1) * 18 : 0) +
    (rebaja ? 30 + 64 : 0) +
    26 +
    precio.px * 1.1;
  const finBloque = d.telefono.trim() ? 1650 : 1780;
  // Con foto el texto va pegado abajo (sube sobre la foto si es largo); sin foto, centrado.
  const y0 = foto ? Math.max(640, finBloque - bloque) : Math.max(320, (330 + finBloque - bloque) / 2 + 30);

  if (foto) {
    dibujarCubriendo(c, foto, 0, 0, ANCHO, ANCHO);
    // La foto se funde con el fondo para que el texto se lea.
    const finFundido = Math.min(ANCHO, y0 + 80);
    const g = c.createLinearGradient(0, finFundido - 340, 0, finFundido);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, col.fondo);
    c.fillStyle = g;
    c.fillRect(0, finFundido - 340, ANCHO, 341);
    c.fillStyle = col.fondo;
    c.fillRect(0, finFundido, ANCHO, ALTO - finFundido);
    // Sombra suave arriba para que el logo resalte en fotos claras.
    const s = c.createLinearGradient(0, 0, 0, 340);
    s.addColorStop(0, "rgba(0,0,0,.28)");
    s.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = s;
    c.fillRect(0, 0, ANCHO, 340);
  }

  logoArriba(c, r, col, f, 190);

  // Etiquetas de arriba.
  if (d.etiqueta === "nuevo") {
    c.font = `800 34px ${f.texto}`;
    espaciado(c, 6);
    const w = c.measureText("NUEVO").width + 60;
    rectRedondo(c, ANCHO - 70 - w, 110, w, 76, 14);
    c.fillStyle = col.fondo;
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = col.acento[1];
    c.stroke();
    c.fillStyle = col.acento[0];
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("NUEVO", ANCHO - 70 - w / 2 + 3, 150);
    espaciado(c, 0);
  }
  if (d.etiqueta === "ultimas") {
    c.font = `800 38px ${f.texto}`;
    espaciado(c, 3);
    const w = c.measureText("ÚLTIMAS UNIDADES").width + 64;
    c.save();
    c.shadowColor = "rgba(0,0,0,.35)";
    c.shadowBlur = 30;
    c.shadowOffsetY = 10;
    rectRedondo(c, centro - w / 2, 290, w, 84, 16);
    const g = c.createLinearGradient(centro - w / 2, 0, centro + w / 2, 0);
    g.addColorStop(0, "#b8121f");
    g.addColorStop(1, "#e0303d");
    c.fillStyle = g;
    c.fill();
    c.restore();
    c.fillStyle = "#fff";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("ÚLTIMAS UNIDADES", centro + 2, 334);
    espaciado(c, 0);
  }
  if (rebaja) {
    const cx = ANCHO - 70 - 100;
    const cy = d.etiqueta === "ultimas" ? 570 : 330;
    c.save();
    c.shadowColor = "rgba(0,0,0,.4)";
    c.shadowBlur = 30;
    c.shadowOffsetY = 12;
    c.beginPath();
    c.arc(cx, cy, 100, 0, Math.PI * 2);
    c.fillStyle = col.fondo;
    c.fill();
    c.restore();
    c.lineWidth = 5;
    c.strokeStyle = col.acento[1];
    c.stroke();
    c.font = `800 ${rebaja >= 10 ? 60 : 66}px ${f.texto}`;
    c.fillStyle = col.acento[0];
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(`-${rebaja}%`, cx, cy + 4);
  }

  let y = y0;

  c.textAlign = "center";
  c.textBaseline = "top";
  c.font = fuenteNombre(nombre.px);
  c.fillStyle = "#fff";
  c.save();
  if (foto) {
    c.shadowColor = "rgba(0,0,0,.5)";
    c.shadowBlur = 24;
  }
  nombre.lineas.forEach((l, i) => c.fillText(l, centro, y + i * nombre.px * 1.08));
  c.restore();
  y += altoNombre;

  if (detalle) {
    y += 18;
    c.font = `400 38px ${f.texto}`;
    c.fillStyle = col.suave;
    c.fillText(recortarUnaLinea(c, detalle, 960), centro, y);
    y += 46;
  }

  if (tallas) {
    y += 34;
    const linea = c.createLinearGradient(120, 0, ANCHO - 120, 0);
    linea.addColorStop(0, "rgba(0,0,0,0)");
    linea.addColorStop(0.5, col.acento[1]);
    linea.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = linea;
    c.fillRect(120, y, ANCHO - 240, 2);
    y += 2 + 34;
    c.font = `700 28px ${f.texto}`;
    espaciado(c, 8);
    c.fillStyle = col.tenue;
    c.fillText(d.etiqueta === "ultimas" ? "QUEDAN SOLO ESTAS TALLAS" : "TALLAS DISPONIBLES", centro + 4, y);
    espaciado(c, 0);
    y += 34 + 22;
    c.font = `700 ${tallas.px}px ${f.texto}`;
    c.textBaseline = "middle";
    for (const fila of tallas.filas) {
      const total = fila.reduce((a, i) => a + tallas.anchos[i], 0) + (fila.length - 1) * 22;
      let x = centro - total / 2;
      for (const i of fila) {
        const w = tallas.anchos[i];
        rectRedondo(c, x, y, w, tallas.alto, tallas.alto / 2);
        c.lineWidth = 3;
        c.strokeStyle = col.acento[1];
        c.stroke();
        c.fillStyle = col.acento[0];
        c.fillText(d.tallas[i], x + w / 2, y + tallas.alto / 2 + 2);
        x += w + 22;
      }
      y += tallas.alto + 18;
    }
    y -= 18;
    c.textBaseline = "top";
  }

  if (rebaja) {
    y += 30;
    c.font = `500 56px ${f.texto}`;
    const antes = formatearPesos(d.precio);
    c.fillStyle = "#8d826b";
    c.fillText(antes, centro, y);
    const w = c.measureText(antes).width;
    c.fillStyle = "#e0303d";
    c.fillRect(centro - w / 2 - 8, y + 30, w + 16, 6);
    y += 64;
  }

  y += 26;
  c.font = fuentePrecio(precio.px);
  c.fillStyle = degradadoAcento(c, col, y, precio.px);
  c.fillText(precio.lineas[0], centro, y);

  if (d.telefono.trim()) botonWhatsApp(c, d.telefono.trim(), f, 1690);
  piePagina(c, r, col, f);
}

/** Collage "Llegó mercancía nueva": hasta 6 prendas con su foto y precio. */
export function dibujarCollage(
  c: C,
  d: DisenoCollage,
  fotos: (HTMLImageElement | null)[],
  r: Recursos,
  col: Colores,
  f: Fuentes,
) {
  c.clearRect(0, 0, ANCHO, ALTO);
  fondoOscuro(c, col);
  const centro = ANCHO / 2;
  logoArriba(c, r, col, f, 170);

  c.textAlign = "center";
  c.textBaseline = "top";
  c.font = `700 30px ${f.texto}`;
  espaciado(c, 8);
  c.fillStyle = col.suave;
  c.fillText(hayPromocion(d) ? "✦ PROMOCIÓN ✦" : "✦ RECIÉN LLEGADO ✦", centro + 4, 272);
  espaciado(c, 0);
  const titulo = ajustarTexto(
    c,
    d.titulo.trim() || "Llegó mercancía nueva",
    (p) => `italic 700 ${p}px ${f.titulo}`,
    980,
    96,
    56,
    2,
  );
  c.font = `italic 700 ${titulo.px}px ${f.titulo}`;
  const yTitulo = 322;
  const altoTitulo = titulo.lineas.length * titulo.px * 1.08;
  c.fillStyle = degradadoAcento(c, col, yTitulo, altoTitulo);
  titulo.lineas.forEach((l, i) => c.fillText(l, centro, yTitulo + i * titulo.px * 1.08));

  const conTelefono = !!d.telefono.trim();
  const nota = d.nota.trim();
  const arriba = yTitulo + altoTitulo + 60;
  const abajo = conTelefono ? (nota ? 1590 : 1650) : nota ? 1730 : 1800;
  const piezas = d.piezas.slice(0, 6);

  if (piezas.length) {
    const { columnas, filas } = rejillaCollage(piezas.length);
    const espacio = 26;
    const anchoTarjeta = (ANCHO - 100 - espacio * (columnas - 1)) / columnas;
    const escalaTexto = columnas === 1 ? 1.5 : columnas === 2 ? 1.2 : 1;
    // Con promoción cada tarjeta lleva también el precio de antes, tachado.
    const conOferta = hayPromocion({ piezas });
    const altoTexto = (columnas === 1 ? 170 : 130) + (conOferta ? 34 * escalaTexto : 0);
    const altoFoto = Math.min(anchoTarjeta * 1.2, (abajo - arriba - espacio * (filas - 1)) / filas - altoTexto);
    const altoTarjeta = altoFoto + altoTexto;
    const altoRejilla = filas * altoTarjeta + (filas - 1) * espacio;
    const yRejilla = arriba + (abajo - arriba - altoRejilla) / 2;

    piezas.forEach((p, i) => {
      const fila = Math.floor(i / columnas);
      const enFila = Math.min(columnas, piezas.length - fila * columnas);
      // La última fila incompleta queda centrada.
      const desplazar = ((columnas - enFila) * (anchoTarjeta + espacio)) / 2;
      const x = 50 + desplazar + (i % columnas) * (anchoTarjeta + espacio);
      const y = yRejilla + fila * (altoTarjeta + espacio);
      c.save();
      rectRedondo(c, x, y, anchoTarjeta, altoTarjeta, 28);
      c.fillStyle = col.tarjeta;
      c.fill();
      c.clip();
      const foto = fotos[i];
      if (foto) dibujarCubriendo(c, foto, x, y, anchoTarjeta, altoFoto);
      else {
        const g = c.createRadialGradient(
          x + anchoTarjeta / 2,
          y + altoFoto * 0.45,
          10,
          x + anchoTarjeta / 2,
          y + altoFoto * 0.45,
          anchoTarjeta,
        );
        g.addColorStop(0, col.fotoFondo[0]);
        g.addColorStop(1, col.fotoFondo[1]);
        c.fillStyle = g;
        c.fillRect(x, y, anchoTarjeta, altoFoto);
        const inicial = p.nombre.trim().charAt(0).toUpperCase() || "?";
        c.font = `700 ${Math.round(altoFoto * 0.45)}px ${f.titulo}`;
        c.fillStyle = col.acento[2];
        c.textBaseline = "middle";
        c.fillText(inicial, x + anchoTarjeta / 2, y + altoFoto / 2);
        c.textBaseline = "top";
      }
      c.restore();
      rectRedondo(c, x + 1, y + 1, anchoTarjeta - 2, altoTarjeta - 2, 27);
      c.lineWidth = 2;
      c.strokeStyle = col.borde;
      c.stroke();
      c.font = `600 ${Math.round(30 * escalaTexto)}px ${f.texto}`;
      c.fillStyle = "#f3ead8";
      c.fillText(recortarUnaLinea(c, p.nombre, anchoTarjeta - 30), x + anchoTarjeta / 2, y + altoFoto + 20 * escalaTexto);
      const rebaja = p.oferta !== null ? porcentajeRebaja(p.precio, p.oferta) : null;
      let yPrecio = y + altoFoto + 62 * escalaTexto;
      if (rebaja) {
        const pxAntes = Math.round(26 * escalaTexto);
        c.font = `500 ${pxAntes}px ${f.texto}`;
        const antes = formatearPesos(p.precio);
        c.fillStyle = "#8d826b";
        c.fillText(antes, x + anchoTarjeta / 2, yPrecio - 4);
        const w = c.measureText(antes).width;
        c.fillStyle = "#e0303d";
        c.fillRect(x + anchoTarjeta / 2 - w / 2 - 4, yPrecio - 4 + pxAntes * 0.55, w + 8, Math.max(3, 3 * escalaTexto));
        yPrecio += 34 * escalaTexto;
        // Etiqueta roja con el descuento, sobre la foto.
        c.font = `800 ${Math.round(28 * escalaTexto)}px ${f.texto}`;
        const etiqueta = `-${rebaja}%`;
        const we = c.measureText(etiqueta).width + 24 * escalaTexto;
        const he = 46 * escalaTexto;
        rectRedondo(c, x + 14, y + 14, we, he, 12);
        c.fillStyle = "#d01c2b";
        c.fill();
        c.fillStyle = "#fff";
        c.textBaseline = "middle";
        c.fillText(etiqueta, x + 14 + we / 2, y + 14 + he / 2 + 2);
        c.textBaseline = "top";
      }
      const px = Math.round(42 * escalaTexto);
      c.font = `800 ${px}px ${f.texto}`;
      c.fillStyle = degradadoAcento(c, col, yPrecio, px);
      c.fillText(formatearPesos(rebaja ? p.oferta! : p.precio), x + anchoTarjeta / 2, yPrecio);
    });
  }

  if (nota) {
    c.font = `400 34px ${f.texto}`;
    c.fillStyle = col.suave;
    c.textBaseline = "top";
    c.fillText(recortarUnaLinea(c, nota, 960), centro, abajo + 30);
  }
  if (conTelefono) botonWhatsApp(c, d.telefono.trim(), f, 1715);
  else piePagina(c, r, col, f);
}

/** Pasa el canvas a un archivo PNG para compartir o descargar. */
export function aArchivo(lienzo: HTMLCanvasElement, nombre: string): Promise<File | null> {
  return new Promise((listo) =>
    lienzo.toBlob((blob) => listo(blob ? new File([blob], nombre, { type: "image/png" }) : null), "image/png"),
  );
}
