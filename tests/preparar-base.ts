// Antes de las pruebas: aplica las migraciones a la base de pruebas.
import "dotenv/config";
import { execSync } from "node:child_process";

export default function prepararBase() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("Define DATABASE_URL_TEST en .env para correr las pruebas.");
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}
