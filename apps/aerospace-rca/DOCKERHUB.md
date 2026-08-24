# Aerospace RCA

**A working root-cause-analysis demo for aerospace telemetry.** An anomaly appears in live sensor data; the app finds comparable failures in maintenance history by meaning rather than keyword, walks the component-and-supplier graph to find what they share, drafts an analysis, and records every step in an audit trail you can replay.

Built on [SynapCores AIDB](https://hub.docker.com/r/synapcores/community) — vector search, graph traversal, immutable audit and agents in one engine, no glue services.

## Run it

No clone, no build, no keys to paste. Save this as `docker-compose.yml`:

```yaml
name: aerospace-rca
services:
  engine:
    image: synapcores/community:latest
    pull_policy: always
    environment:
      - AIDB_ACCEPT_LICENSE=1
      - AIDB_JWT_SECRET=demo-only-change-me-0123456789abcdefghij
      - AIDB_ADMIN_PASSWORD=demo-only-change-me
    volumes:
      - aidb_data:/var/lib/synapcores
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://127.0.0.1:8080/health"]
      interval: 10s
      timeout: 3s
      retries: 12

  bridge:
    image: synapcores/aerospace-rca-bridge:latest
    depends_on: [engine]
    environment:
      - SYNAPCORES_URL=http://engine:8080
      - AIDB_ADMIN_PASSWORD=demo-only-change-me

  app:
    image: synapcores/aerospace-rca:latest
    depends_on: [engine]
    environment:
      - SYNAPCORES_URL=http://engine:8080
      - AIDB_ADMIN_PASSWORD=demo-only-change-me
    ports:
      - "3005:3005"

volumes:
  aidb_data:
```

```bash
docker compose up -d
```

Then open **<http://localhost:3005/demo>**.

First boot takes a minute or so: the engine initialises, the app applies its schema and seeds ~44 anomalies, 29 parts, 15 suppliers and 3000 telemetry readings, then serves the demo. Re-running is safe — the seed resets itself.

The secrets above are throwaway values for a local demo. Replace both before anyone else can reach it.

## What you get

| | |
|---|---|
| `app` (port 3005) | the demo UI — anomaly feed, similarity search, graph explorer, drafted analyses |
| `bridge` | generates telemetry and streams it into the engine |
| `engine` | SynapCores AIDB — storage, vectors, graph, audit, agents |

## Configuration

| Variable | Default | Description |
|---|---|---|
| `SYNAPCORES_URL` | `http://engine:8080` | Where the engine lives |
| `AIDB_ADMIN_PASSWORD` | — | Admin password pinned on the engine; the app exchanges it for a token at startup. No token is baked into this image. |
| `BRIDGE_SOURCE` | `mock` | Telemetry source for the bridge |
| `DCU_AGGREGATE_PERIOD_MS` | `5000` | Telemetry aggregation window |

## Tags

`latest` follows the default branch; version tags follow releases.

Note that pulling `latest` once does not keep a host current — Docker re-resolves a floating tag only on an explicit `docker compose pull`. The compose above sets `pull_policy: always` on the engine so it tracks upstream.

## Source

<https://github.com/SynapCores/synapcores-aerospace-rca> — Apache 2.0. Build from source with `docker compose build`.
