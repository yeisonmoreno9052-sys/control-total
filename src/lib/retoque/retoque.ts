// Solo en el navegador: "retoque elegante" de las fotos del catálogo.
//
// 1. Un modelo pequeño (U²-Netp, 4,5 MB, licencia Apache 2.0) separa la prenda del fondo.
//    Corre dentro del celular: no se paga por foto y la foto no sale a ningún servicio.
// 2. La prenda se pone centrada sobre un fondo de estudio beige, con sombra suave.
// 3. Se le arregla un poco la luz.
//
// El modelo y el motor (onnxruntime-web) se descargan la primera vez y el navegador los guarda.
import { aGris, revisarGris, type Revision } from "./calidad";

const LADO_MODELO = 320;
const SALIDA = { ancho: 1000, alto: 1250 };
const PESO_MAXIMO = 190 * 1024;

type Sesion = import("onnxruntime-web").InferenceSession;
type Ort = typeof import("onnxruntime-web");
let cargando: Promise<{ ort: Ort; sesion: Sesion }> | null = null;

/** Descarga el motor y el modelo una sola vez (se puede llamar antes para ganar tiempo). */
export function prepararRetoque() {
  cargando ??= (async () => {
    const ort = await import("onnxruntime-web/wasm");
    ort.env.wasm.wasmPaths = "/ort/";
    ort.env.wasm.numThreads = 1;
    const sesion = await ort.InferenceSession.create("/modelos/u2netp.onnx", { executionProviders: ["wasm"] });
    return { ort: ort as unknown as Ort, sesion };
  })();
  cargando.catch(() => {
    cargando = null;
  });
  return cargando;
}

function lienzo(ancho: number, alto: number) {
  const c = document.createElement("canvas");
  c.width = ancho;
  c.height = alto;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Sin canvas");
  return { c, ctx };
}

/** ¿Quedó oscura o borrosa? */
export function revisarFoto(imagen: ImageBitmap): Revision {
  const ancho = 256;
  const alto = Math.max(1, Math.round((imagen.height * ancho) / imagen.width));
  const { ctx } = lienzo(ancho, alto);
  ctx.drawImage(imagen, 0, 0, ancho, alto);
  return revisarGris(aGris(ctx.getImageData(0, 0, ancho, alto).data, ancho, alto), ancho, alto);
}

/** Qué tan "prenda" es cada punto (0 a 1), en una cuadrícula de 320 × 320. */
async function mascara(imagen: ImageBitmap) {
  const { ort, sesion } = await prepararRetoque();
  const { ctx } = lienzo(LADO_MODELO, LADO_MODELO);
  ctx.drawImage(imagen, 0, 0, LADO_MODELO, LADO_MODELO);
  const px = ctx.getImageData(0, 0, LADO_MODELO, LADO_MODELO).data;
  const n = LADO_MODELO * LADO_MODELO;
  const entrada = new Float32Array(3 * n);
  const media = [0.485, 0.456, 0.406];
  const desv = [0.229, 0.224, 0.225];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) entrada[k * n + i] = (px[i * 4 + k] / 255 - media[k]) / desv[k];
  const tensor = new ort.Tensor("float32", entrada, [1, 3, LADO_MODELO, LADO_MODELO]);
  const salida = await sesion.run({ [sesion.inputNames[0]]: tensor });
  const datos = salida[sesion.outputNames[0]].data as Float32Array;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    if (datos[i] < min) min = datos[i];
    if (datos[i] > max) max = datos[i];
  }
  const m = new Float32Array(n);
  for (let i = 0; i < n; i++) m[i] = (datos[i] - min) / (max - min || 1);
  return m;
}

/**
 * Retoca la foto. Devuelve null si no se pudo separar la prenda del fondo
 * (por ejemplo, la prenda ocupa toda la foto o casi no se ve).
 */
export async function retocarFoto(imagen: ImageBitmap): Promise<Blob | null> {
  const m = await mascara(imagen);

  // La foto a un tamaño de trabajo y la máscara estirada a ese mismo tamaño (con suavizado).
  const escala = Math.min(1, 1400 / Math.max(imagen.width, imagen.height));
  const W = Math.round(imagen.width * escala);
  const H = Math.round(imagen.height * escala);
  const foto = lienzo(W, H);
  foto.ctx.drawImage(imagen, 0, 0, W, H);
  const chica = lienzo(LADO_MODELO, LADO_MODELO);
  const pm = chica.ctx.createImageData(LADO_MODELO, LADO_MODELO);
  for (let i = 0; i < m.length; i++) {
    const v = Math.round(m[i] * 255);
    pm.data[i * 4] = pm.data[i * 4 + 1] = pm.data[i * 4 + 2] = v;
    pm.data[i * 4 + 3] = 255;
  }
  chica.ctx.putImageData(pm, 0, 0);
  const grande = lienzo(W, H);
  grande.ctx.imageSmoothingQuality = "high";
  grande.ctx.drawImage(chica.c, 0, 0, W, H);
  const alfa = grande.ctx.getImageData(0, 0, W, H).data;

  const img = foto.ctx.getImageData(0, 0, W, H);
  const p = img.data;
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  let dentro = 0;
  const luces: number[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      // Borde suave: lo dudoso queda medio transparente.
      const a = Math.min(1, Math.max(0, (alfa[i] / 255 - 0.2) / 0.6));
      p[i + 3] = Math.round(a * 255);
      if (a > 0.5) {
        dentro++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        if ((x + y) % 7 === 0) luces.push(0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]);
      }
    }
  }
  const fraccion = dentro / (W * H);
  if (x1 < 0 || fraccion < 0.03 || fraccion > 0.97) return null;

  // Luz: estira un poco el rango de la prenda (sin exagerar).
  luces.sort((a, b) => a - b);
  const bajo = luces[Math.floor(luces.length * 0.02)] ?? 0;
  const alto = luces[Math.floor(luces.length * 0.98)] ?? 255;
  const k = Math.min(1.35, 255 / Math.max(60, alto - bajo));
  if (k > 1.02) {
    for (let i = 0; i < p.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const v = p[i + c];
        const estirado = (v - bajo) * k;
        p[i + c] = Math.max(0, Math.min(255, v + 0.55 * (estirado - v)));
      }
    }
  }
  foto.ctx.putImageData(img, 0, 0);

  // Composición: fondo de estudio, sombra suave y la prenda centrada.
  const { c: salida, ctx } = lienzo(SALIDA.ancho, SALIDA.alto);
  const fondo = ctx.createRadialGradient(SALIDA.ancho / 2, SALIDA.alto * 0.38, 40, SALIDA.ancho / 2, SALIDA.alto * 0.45, SALIDA.alto * 0.8);
  fondo.addColorStop(0, "#f4efe7");
  fondo.addColorStop(1, "#d9cdbd");
  ctx.fillStyle = fondo;
  ctx.fillRect(0, 0, SALIDA.ancho, SALIDA.alto);

  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const e = Math.min((SALIDA.ancho * 0.8) / bw, (SALIDA.alto * 0.8) / bh);
  const dw = bw * e;
  const dh = bh * e;
  const dx = (SALIDA.ancho - dw) / 2;
  const dy = SALIDA.alto * 0.46 - dh / 2;

  // Sombra en el piso.
  const piso = ctx.createRadialGradient(SALIDA.ancho / 2, dy + dh + 10, 4, SALIDA.ancho / 2, dy + dh + 10, dw * 0.55);
  piso.addColorStop(0, "rgba(60,45,30,0.28)");
  piso.addColorStop(1, "rgba(60,45,30,0)");
  ctx.save();
  ctx.translate(0, dy + dh + 10);
  ctx.scale(1, 0.12);
  ctx.fillStyle = piso;
  ctx.fillRect(0, -dw, SALIDA.ancho, dw * 2);
  ctx.restore();

  // Sombra de la prenda y la prenda.
  ctx.save();
  ctx.shadowColor = "rgba(40,30,20,0.28)";
  ctx.shadowBlur = 38;
  ctx.shadowOffsetY = 16;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(foto.c, x0, y0, bw, bh, dx, dy, dw, dh);
  ctx.restore();

  for (const calidad of [0.86, 0.76, 0.66, 0.56]) {
    const blob = await new Promise<Blob | null>((ok) => salida.toBlob(ok, "image/webp", calidad));
    if (blob && blob.type === "image/webp" && blob.size <= PESO_MAXIMO) return blob;
    const jpg = await new Promise<Blob | null>((ok) => salida.toBlob(ok, "image/jpeg", calidad));
    if (jpg && jpg.size <= PESO_MAXIMO) return jpg;
  }
  return null;
}
