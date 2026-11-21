-- Código de barras corto (solo números) para las tallas/colores de las prendas que no tienen uno.
-- "29" + número de la prenda (5 cifras) + consecutivo dentro de la prenda (3 cifras). Ej.: PR-0163 → 2900163001.
-- Las etiquetas viejas siguen sirviendo (la caja también encuentra el código PR-…).
WITH v AS (
  SELECT
    id,
    "negocioId",
    '29' || LPAD(SUBSTRING("codigo" FROM '^PR-([0-9]{1,5})-'), 5, '0') AS prefijo,
    ROW_NUMBER() OVER (PARTITION BY "negocioId", SUBSTRING("codigo" FROM '^PR-([0-9]{1,5})-') ORDER BY "creadoEn", id) AS k
  FROM "Producto"
  WHERE "prendaId" IS NOT NULL AND "codigoBarras" IS NULL AND "codigo" ~ '^PR-[0-9]{1,5}-'
)
UPDATE "Producto" p
SET "codigoBarras" = v.prefijo || LPAD(v.k::text, 3, '0'), "actualizadoEn" = NOW()
FROM v
WHERE p.id = v.id
  AND v.k < 1000
  AND NOT EXISTS (
    SELECT 1 FROM "Producto" q WHERE q."negocioId" = v."negocioId" AND q."codigoBarras" = v.prefijo || LPAD(v.k::text, 3, '0')
  );
