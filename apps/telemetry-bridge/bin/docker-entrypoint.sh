#!/bin/sh
# telemetry-bridge container entrypoint.
#   1. log in to the gateway (pinned admin password → minted JWT)
#   2. start the bridge (tsx runtime)
# The bridge also retries the registry load internally; the login retry
# here covers the gateway-warmup window.
set -eu

echo "[entrypoint] logging in to gateway at ${SYNAPCORES_URL:-http://engine:8081}"
SYNAPCORES_ADMIN_API_KEY="$(node bin/aidb-login.mjs)"
export SYNAPCORES_ADMIN_API_KEY

echo "[entrypoint] starting telemetry-bridge on :${DCU_BRIDGE_PORT:-4005} (source=${BRIDGE_SOURCE:-mock})"
exec ./node_modules/.bin/tsx src/index.ts
