// Las pruebas usan SIEMPRE la base de pruebas, nunca la de desarrollo.
import "dotenv/config";

if (!process.env.DATABASE_URL_TEST) {
  throw new Error("Define DATABASE_URL_TEST en .env para correr las pruebas.");
}
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
