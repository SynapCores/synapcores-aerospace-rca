# aerospace-rca — AIDB vertical demo

Aerospace anomaly investigation memory + DCU live-telemetry detection, built on
[SynapCores AIDB](https://github.com/SynapCores/synapcores) and the
[@synapcores/app-framework](https://github.com/SynapCores/synapcores-soar).

Two apps:

- **`apps/aerospace-rca/`** — Next.js investigation app. Anomaly list, RCA
  workspace, force-graph supplier fingerprint, immutable evidence chain,
  agentic personas. Five-act cinematic playback on `/demo`.
- **`apps/telemetry-bridge/`** — Node WebSocket service that ingests a
  simulated 3 K-sensor × 100 Hz telemetry stream, runs z-score anomaly
  detection in a sliding window, batches 1 Hz aggregates to AIDB, and
  promotes detections into the investigation table for cross-program recall.

## Quick start

```sh
# Requires: SynapCores AIDB running locally (any v1.8.3+)
pnpm install
pnpm --filter @synapcores/aerospace-rca bootstrap
pnpm --filter @synapcores/aerospace-rca seed-demo
# two terminals:
pnpm --filter @synapcores/telemetry-bridge dev    # → ws://localhost:4005
pnpm --filter @synapcores/aerospace-rca dev        # → http://localhost:3005
```

Open `/demo` for the 5-act playback or `/dcu` for live telemetry.

## License

Apache-2.0.
