# Aerospace RCA — telemetry bridge

Companion service for the [Aerospace RCA demo](https://hub.docker.com/r/synapcores/aerospace-rca). It generates aircraft telemetry, detects anomalies in the stream, and writes them into [SynapCores AIDB](https://hub.docker.com/r/synapcores/community) for the demo app to investigate.

This image is not useful on its own — see the [Aerospace RCA page](https://hub.docker.com/r/synapcores/aerospace-rca) for the compose file that runs all three services together.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `SYNAPCORES_URL` | `http://engine:8080` | Where the engine lives |
| `AIDB_ADMIN_PASSWORD` | — | Admin password pinned on the engine; the bridge exchanges it for a token at startup |
| `BRIDGE_SOURCE` | `mock` | `mock` generates synthetic telemetry |
| `DCU_AGGREGATE_PERIOD_MS` | `5000` | Aggregation window in milliseconds |

## Source

<https://github.com/SynapCores/synapcores-aerospace-rca> — Apache 2.0.
