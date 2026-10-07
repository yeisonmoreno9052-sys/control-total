import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "src") } },
  test: {
    environment: "node",
    globalSetup: ["tests/preparar-base.ts"],
    setupFiles: ["tests/entorno.ts"],
    // Las pruebas comparten la base de datos de pruebas: una a la vez.
    fileParallelism: false,
  },
});
