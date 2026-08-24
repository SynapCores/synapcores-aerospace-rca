# Aerospace RCA

**A working root-cause-analysis demo for aerospace telemetry.** An anomaly appears in live sensor data; the app finds comparable failures in maintenance history by meaning rather than keyword, walks the component-and-supplier graph to see what they share, drafts an analysis, and records every step in an audit trail you can replay.

Everything is in this one image — database, telemetry feed and web app. Nothing else to install.

## Run it

```bash
docker run -p 3005:3005 synapcores/aerospace-rca
```

Open **<http://localhost:3005/demo>**.

First boot takes under a minute: the engine starts, the schema is applied, and the demo seeds ~44 anomalies, 29 parts, 15 suppliers and 3000 telemetry readings. Then the UI is live and telemetry starts streaming.

To keep the data between runs, give it a volume:

```bash
docker run -p 3005:3005 -v aero:/var/lib/synapcores synapcores/aerospace-rca
```

## What's inside

[SynapCores AIDB](https://hub.docker.com/r/synapcores/community) — vector search, graph traversal, immutable audit and agents in one engine — plus a telemetry bridge that generates and streams sensor data, and the Next.js app you interact with. They run as one container so trying the demo is a single command.

Credentials are generated fresh inside each container, so no image ships a known password and nothing is baked in.

## Configuration

Nothing is required. All optional:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3005` | Port the UI listens on |
| `AIDB_ADMIN_PASSWORD` | random per container | Set one if you want to reach the engine API yourself |
| `BRIDGE_SOURCE` | `mock` | Telemetry source |
| `DCU_AGGREGATE_PERIOD_MS` | `5000` | Telemetry aggregation window |

The engine's API is on port 8080 inside the container. Publish it with `-p 8080:8080` if you want to query the data directly.

## Tags

`latest` follows the default branch; version tags follow releases. Pulling `latest` once does not keep a host current — Docker re-resolves a floating tag only on an explicit `docker pull`.

## Running it as separate services

For a deployment where the engine is operated and upgraded independently of the app, the repository ships a three-service compose file. This image is for trying the demo, not for running the engine in production.

## Source

<https://github.com/SynapCores/synapcores-aerospace-rca> — Apache 2.0.
