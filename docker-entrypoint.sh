#!/bin/sh
set -e
cd /app/server

# Shared web rules under /app/src/lib use the @/ import alias.
ALIAS="--import ./scripts/register-src-alias.mjs"

if [ "${RUN_SEED:-true}" = "true" ]; then
  node $ALIAS src/seed.js
fi

exec node $ALIAS src/index.js
