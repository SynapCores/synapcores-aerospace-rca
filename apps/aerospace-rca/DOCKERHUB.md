# Aerospace RCA

**Root-cause analysis demo for aerospace telemetry**, built on SynapCores AIDB: vector search over maintenance history, a graph of components and failure modes, an immutable audit trail, and agents that draft the analysis.

This image is the demo web application. It needs a SynapCores engine and the telemetry bridge alongside it; the compose file below wires all three up.

## Quick start

```bash
git clone https://github.com/SynapCores/synapcores-aerospace-rca
cd synapcores-aerospace-rca
cp .env.example .env      # then set the two secrets
docker compose up -d
```

Open <http://localhost:3005/demo>.

## What the container does on start

1. Logs in to the engine with the pinned admin password to mint a token — no token is baked into the image.
2. Applies the domain schema (idempotent).
3. Seeds the demo corpus, holding back the current anomaly so the live path has something to find.
4. Starts the Next.js production server on port 3005.

## Environment

| Variable | Required | Description |
|---|---|---|
| `SYNAPCORES_URL` | yes | Engine base URL, e.g. `http://engine:8080` |
| `AIDB_ADMIN_PASSWORD` | yes | Admin password pinned on the engine; the app logs in with it |

## Note on the engine volume

Mount the engine's data volume at `/var/lib/synapcores`, **not** `/opt/synapcores/aidb_data`. The latter is a symlink inside the engine image, and mounting a volume over it makes model auto-pull fail with `ENOENT` on a fresh volume, which breaks embedding generation and the demo seed. The bundled compose file already does this correctly.

## Tags

`latest` tracks the default branch. Pulling `latest` once does not keep a host current — Docker only re-resolves a floating tag on an explicit `docker compose pull`, or set `pull_policy: always`.

## Source and licence

<https://github.com/SynapCores/synapcores-aerospace-rca> — Apache 2.0.
