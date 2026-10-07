import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Aislamiento: fuera de src/lib/datos nadie toca la base de datos directamente.
  // Todo pasa por datosDe(contexto), que filtra por empresa y negocio.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/datos/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/generated/prisma/client", "@/generated/prisma/internal/*", "**/generated/prisma/client"],
              message: "Usa la capa de datos (src/lib/datos) en lugar del cliente de Prisma.",
            },
            {
              group: ["@/lib/datos/cliente", "**/datos/cliente"],
              message: "Usa datosDe(contexto) de src/lib/datos/alcance en lugar del cliente sin filtros.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "src/generated/**"]),
]);

export default eslintConfig;
