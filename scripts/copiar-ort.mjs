// Copia el motor de onnxruntime-web (WebAssembly) a public/ort para que el navegador lo
// descargue de nuestra propia app. Corre solo después de "npm install" (postinstall).
import { copyFileSync, existsSync, mkdirSync } from "node:fs";

const origen = "node_modules/onnxruntime-web/dist";
const destino = "public/ort";
if (!existsSync(origen)) process.exit(0);
mkdirSync(destino, { recursive: true });
for (const archivo of ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"]) {
  copyFileSync(`${origen}/${archivo}`, `${destino}/${archivo}`);
}
