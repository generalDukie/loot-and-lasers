#!/bin/sh
set -e
cd /app/server

if [ "${RUN_SEED:-true}" = "true" ]; then
  node src/seed.js
fi

exec node src/index.js
