#!/bin/sh
# Single-container supervisor for the Aerospace RCA demo.
#
# Starts the engine, waits for it, seeds the demo, then runs the bridge and the
# web app. Everything logs to this container's stdout with a prefix so one
# `docker logs` shows the whole story.
#
# Deliberately simple: three children and a wait. If any of them exits, the
# container exits too, so a failure surfaces instead of leaving a half-dead
# demo answering on port 3005.
set -eu

log() { echo "[demo] $*"; }
ENGINE_URL="${SYNAPCORES_URL:-http://127.0.0.1:8080}"

# A pinned password so the app and bridge can mint their own tokens. Random per
# container unless the operator sets one, so no image ships a known credential.
if [ -z "${AIDB_ADMIN_PASSWORD:-}" ]; then
  AIDB_ADMIN_PASSWORD="$(head -c 18 /dev/urandom | base64 | tr -d '/+=')"
  export AIDB_ADMIN_PASSWORD
  log "generated a random admin password for this container"
fi
if [ -z "${AIDB_JWT_SECRET:-}" ]; then
  AIDB_JWT_SECRET="$(head -c 48 /dev/urandom | base64 | tr -d '\n')"
  export AIDB_JWT_SECRET
fi

log "starting SynapCores engine"
# Must pass the image's own config. Launching the binary bare falls back to
# compiled defaults with a short request timeout, and CREATE TABLE then dies
# with "Operation timeout" while the gateway still answers on :8080 -- a demo
# that looks up but has no schema.
( cd /opt/synapcores && ./synapcores --config /etc/synapcores/gateway.toml ) 2>&1 | sed 's/^/[engine] /' &
ENGINE_PID=$!

log "waiting for the engine"
i=0
until curl -fsS "${ENGINE_URL}/health" >/dev/null 2>&1; do
  i=$((i+1))
  if [ "$i" -ge 90 ]; then
    log "engine did not become healthy after 180s"; exit 1
  fi
  kill -0 "$ENGINE_PID" 2>/dev/null || { log "engine exited during startup"; exit 1; }
  sleep 2
done
log "engine is up"

cd /srv/apps/aerospace-rca
log "minting an admin token"
SYNAPCORES_ADMIN_API_KEY="$(node bin/aidb-login.mjs)"
export SYNAPCORES_ADMIN_API_KEY

log "applying schema"
node bin/bootstrap.mjs 2>&1 | sed 's/^/[schema] /'

log "seeding the demo corpus"
node bin/seed-demo.mjs --bulk --hold-today 2>&1 | sed 's/^/[seed] /'

log "starting telemetry bridge"
( cd /srv/apps/telemetry-bridge && ./node_modules/.bin/tsx src/index.ts 2>&1 | sed 's/^/[bridge] /' ) &
BRIDGE_PID=$!

log "starting web app on :${PORT:-3005}"
node /srv/apps/aerospace-rca/server.js 2>&1 | sed 's/^/[app] /' &
APP_PID=$!

log "ready — open http://localhost:${PORT:-3005}/demo"

# Supervise. `wait -n` is a bashism -- this image's /bin/sh is dash, where it
# fails with "Illegal option -n", so an earlier version of this script could not
# detect a dead child at all and happily served a demo with no telemetry bridge.
# Poll the three PIDs instead; POSIX everywhere.
while true; do
  for pid_name in "$ENGINE_PID engine" "$BRIDGE_PID bridge" "$APP_PID app"; do
    pid=${pid_name%% *}; name=${pid_name##* }
    if ! kill -0 "$pid" 2>/dev/null; then
      log "$name exited — shutting the container down so the failure is visible"
      kill "$ENGINE_PID" "$BRIDGE_PID" "$APP_PID" 2>/dev/null || true
      exit 1
    fi
  done
  sleep 5
done
