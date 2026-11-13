-- Búsqueda sin tildes: "pantalon" encuentra "Pantalón".
-- "nombreBusqueda" es el nombre en minúsculas y sin tildes. Lo llena la base de datos sola
-- (con un disparador) cada vez que se crea un producto o se le cambia el nombre.
CREATE OR REPLACE FUNCTION ct_sin_tildes(texto text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$ SELECT translate(lower(texto), 'áéíóúüñàèìòùäëïöâêîôû', 'aeiouunaeiouaeioaeiou') $$;

ALTER TABLE "Producto" ADD COLUMN "nombreBusqueda" TEXT NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION ct_producto_nombre_busqueda() RETURNS trigger
  LANGUAGE plpgsql
  AS $$ BEGIN NEW."nombreBusqueda" := ct_sin_tildes(NEW."nombre"); RETURN NEW; END $$;

CREATE TRIGGER "Producto_nombreBusqueda"
  BEFORE INSERT OR UPDATE OF "nombre", "nombreBusqueda" ON "Producto"
  FOR EACH ROW EXECUTE FUNCTION ct_producto_nombre_busqueda();

UPDATE "Producto" SET "nombreBusqueda" = ct_sin_tildes("nombre");

CREATE INDEX "Producto_nombreBusqueda_trgm_idx" ON "Producto" USING GIN ("nombreBusqueda" gin_trgm_ops);
