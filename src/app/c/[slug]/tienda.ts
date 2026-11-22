import "server-only";
import { cache } from "react";
import { buscarTienda } from "@/lib/datos/catalogo-publico";

/** La tienda del link, una sola consulta por petición. */
export const tiendaDe = cache((slug: string) => buscarTienda(slug));
