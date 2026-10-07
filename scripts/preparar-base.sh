#!/bin/sh
# Corre antes de arrancar la app (npm lo llama solo con "prestart").
set -e

# Aplica las migraciones pendientes. Nunca borra datos.
npx prisma migrate deploy

# Solo si existe la variable SEED_CONTRASENA: crea la empresa de prueba y sus
# usuarios. Al terminar la prueba, borra esa variable en Railway para que no
# vuelva a correr (el seed reinicia las contraseñas de admin, socio y cajero).
if [ -n "$SEED_CONTRASENA" ]; then
  npx prisma db seed
fi
