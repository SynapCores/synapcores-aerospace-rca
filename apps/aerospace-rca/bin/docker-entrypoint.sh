#!/bin/sh
# Aerospace-RCA app container entrypoint.
#   1. log in to the gateway (pinned admin password → minted JWT)
#   2. apply the domain schema (idempotent)
#   3. seed the demo corpus (resetTables() runs first → safe to re-run)
#   4. start Next.js
set -eu

echo "[entrypoint] logging in to gateway at ${SYNAPCORES_URL:-http://engine:8081}"
SYNAPCORES_ADMIN_API_KEY="$(node bin/aidb-login.mjs)"
export SYNAPCORES_ADMIN_API_KEY

echo "[entrypoint] applying schema"
node bin/bootstrap.mjs

echo "[entrypoint] seeding demo corpus (bulk, holding today's anomaly for the live /dcu path)"
node bin/seed-demo.mjs --bulk --hold-today

echo "[entrypoint] starting Next.js on :3005"
exec pnpm start
