# Control Total

Sistema de inventario, ventas y caja para comercios pequeños. Desarrollado por **EMY TELECOM**.
Las reglas del proyecto (stack, datos, permisos, fases) están en [CLAUDE.md](CLAUDE.md).

## Cómo levantarlo en tu computador

Necesitas instalar una sola vez: **Node.js 20.9 o más nuevo**, **Docker Desktop** y **Git**.

```bash
npm install                 # descarga las librerías
cp .env.example .env        # en Windows: copy .env.example .env  (luego edita AUTH_SECRET y SEED_CONTRASENA)
docker compose up -d        # enciende la base de datos PostgreSQL
npx prisma migrate dev      # crea las tablas
npm run seed                # carga la empresa Camila, 2 negocios y 3 usuarios de prueba
npm run dev                 # abre http://localhost:3000
```

Usuarios de prueba (la contraseña es la que pusiste en `SEED_CONTRASENA`):

| Usuario  | Rol           | Ve                                  |
|----------|---------------|-------------------------------------|
| `admin`  | Administrador | Repuestos de moto y Ferretería      |
| `socio`  | Socio         | Solo Ferretería                     |
| `cajero` | Cajero        | Solo Repuestos de moto              |

Para verlo en el celular: con el computador y el celular en el mismo wifi, abre `http://IP-de-tu-computador:3000`.

## Publicar en Railway

Railway construye la app con `npm run build` y la arranca con `npm start`. Antes de arrancar, npm corre
`scripts/preparar-base.sh` (aplica las migraciones y, solo si existe `SEED_CONTRASENA`, crea los usuarios de prueba).

1. En [railway.com](https://railway.com) crea un proyecto con **Deploy from GitHub repo** y elige `control-total`.
2. En el mismo proyecto agrega **Database → PostgreSQL**.
3. En el servicio de la app, pestaña **Variables**, crea:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `AUTH_SECRET` = una clave larga y aleatoria (`npx auth secret`)
   - `AUTH_TRUST_HOST` = `true`
   - `SEED_CONTRASENA` = la contraseña para admin, socio y cajero (bórrala después del primer despliegue)
4. En **Settings → Networking** toca **Generate Domain** para tener el enlace público.

## Comandos útiles

| Comando             | Qué hace                                                   |
|---------------------|------------------------------------------------------------|
| `npm test`          | Corre las pruebas (usa la base `control_total_test`)       |
| `npm run lint`      | Revisa el código, incluida la regla de aislamiento         |
| `npm run typecheck` | Revisa los tipos de TypeScript                             |
| `npm run build`     | Compila para producción                                    |
| `npx prisma studio` | Abre una vista de la base de datos en el navegador         |

## Inventario: reglas que conviene saber

- **Margen sobre el costo:** costo $ 10.000 con 30 % → precio sugerido $ 13.000. Cada categoría puede tener su propio margen.
- **Redondeo del precio sugerido:** hacia arriba a los $ 50 si es menor de $ 1.000, y a los $ 100 desde ahí.
- **El stock solo cambia con movimientos** (stock inicial, ajuste, importación; luego ventas y compras). Cada producto muestra su historial.
- **Importar:** si un código ya existe, se actualiza ese producto. Si hay una sola fila con error, no se guarda nada.
  Para probar hay un archivo de ejemplo con 50 productos en `docs/ejemplos/ferreteria-50-productos.xlsx`.
- **El cajero** ve productos y stock, pero el servidor nunca le envía el costo ni el margen.

## Cómo está organizado

```
prisma/schema.prisma     Tablas de la base de datos
prisma/migrations/       Historial de cambios de la base (nunca se edita a mano)
prisma/seed.ts           Datos iniciales de prueba
src/app/                 Pantallas (cada carpeta es una dirección de la app)
src/components/          Piezas visuales (ui/ son de shadcn/ui)
src/lib/datos/           ÚNICA puerta a la base de datos
src/styles/tema.css      Colores de marca (cámbialos aquí)
tests/                   Pruebas automáticas
```

### La regla más importante: aislamiento

Ninguna pantalla consulta la base directamente. Todo pasa por `datosDe(contexto)` en
`src/lib/datos/alcance.ts`, que agrega a **cada** consulta el filtro de la empresa del usuario y
de los negocios que tiene permitidos. Si alguien intenta importar Prisma fuera de `src/lib/datos/`,
`npm run lint` lo marca como error. Cuando se agregue una tabla nueva, hay que registrarla en
`MODELOS` dentro de ese archivo; si no, cualquier consulta a ella falla (mejor un error que una fuga).
