# Real telemetry: OpenC3 COSMOS integration

The aerospace-rca demo ships with an in-browser Web Worker that simulates a
3000-channel DCU at 100 Hz. That simulator is the *upstream* of the
telemetry-bridge — **the bridge itself is not a mock.** It runs real
z-score / step / debounce detection on a real WebSocket stream, batches
aggregates into AIDB, and promotes alerts into the investigation-memory
(U1) anomalies table.

This document describes the **real-telemetry path** (Task #416): swapping
that simulated upstream for a live [OpenC3 COSMOS](https://openc3.com)
ground system, the same packet-based command-and-control stack that grew
out of Ball Aerospace COSMOS.

## What COSMOS is (and isn't)

COSMOS is a **ground control center** — mission-ops software that receives,
decommutates, displays, stores, and commands telemetry. It is **not** a
sensor and **not** a DCU. The data path in a real shop:

```
sensor → DCU (on-vehicle, packetizes) → downlink → COSMOS (ground) → us
```

A DCU aggregates raw sensor wiring on the vehicle and emits packets.
COSMOS is where those packets land, already decommutated into named
engineering values. We tap COSMOS — not individual sensors — because it is
the integration seam that already exists: subscribe once, get every
channel, named and timestamped.

## How real-time it is

COSMOS streams every packet that passes through it at **full rate** on the
realtime path — there is no 1–10 Hz cap. That figure is typical *flight
downlink*; the ~1 Hz people associate with COSMOS is the *display refresh*
throttle in Telemetry Viewer/Grapher (purely cosmetic). The logger, TSDB,
and Streaming API all serve full rate underneath.

- The realtime leg rides Valkey/Redis streams and scales with CPU; no
  published packets/sec ceiling.
- **REDUCED** mode (MIN/MAX/AVG/STDDEV at minute/hour/day) is opt-in
  *historical* aggregation — we do **not** use it; we subscribe in
  **DECOM** mode for live named values.
- Net: we drive the EA-1 sim target at 100 Hz to match the mock and keep
  the storyboard timing intact. (Refs:
  [streaming-api](https://docs.openc3.com/docs/development/streaming-api),
  [performance](https://docs.openc3.com/docs/guides/performance).)

## Architecture

```
+------------------------+      ActionCable / WS (DECOM)      +-------------------+
| OpenC3 COSMOS          |  ------------------------------->  | telemetry-bridge  |
| target = EA1           |   /openc3-api/cable                |  src/cosmos.ts    |
| (ea1_sim.rb fault)     |   StreamingChannel                 |  (adapter)        |
+------------------------+                                    +---------+---------+
                                                                        | bridge.ingest()
                                                                        | (unchanged seam)
                                                                        v
                                                              +--------------------+
                                                              | z-score/step/      |
                                                              | debounce detection |
                                                              | + aggregates INSERT|
                                                              | + anomaly EMBED()  |
                                                              +--------------------+
```

The adapter is a thin translator. The bridge's internal `Sample` shape
(`{ sensor_id, value }`) and everything downstream of `bridge.ingest()` are
untouched — the mock and COSMOS are interchangeable upstreams.

## The Streaming API protocol

COSMOS exposes the Streaming API over **ActionCable** (Rails WebSockets) at
`ws://<host>/openc3-api/cable` — not a plain JSON packet stream. The
adapter (`src/cosmos.ts`) implements the full handshake:

1. connect → server sends `{"type":"welcome"}`
2. subscribe to `StreamingChannel` with `{scope, token}` in the identifier
3. send the `add` action with the item list in DECOM converted form:
   `["DECOM__TLM__EA1__TURBOPUMP__VIBRATION_RMS__CONVERTED", "EA1.TURBOPUMP.VIBRATION_RMS"]`
4. receive realtime frames:
   `{"__type":"ITEMS","__time":<ns>,"EA1.TURBOPUMP.VIBRATION_RMS":<value>}`

Each item is subscribed with an explicit short alias (the 2nd tuple
element), so inbound parsing is a direct alias → `sensor_id` lookup with no
string surgery on the hot path. `__time` (nanoseconds) is converted to ms.
The adapter reconnects with exponential backoff and ignores any item not
present in the map (string-state items like `"ENABLED"` are skipped).

## Item → sensor mapping

`config/cosmos-map.json` in the bridge maps a COSMOS alias to a registry
`sensor_id`:

| COSMOS alias (`TARGET.PACKET.ITEM`) | sensor_id | demo act |
|---|---|---|
| `EA1.TURBOPUMP.VIBRATION_RMS` | `EA1-027-TP-VIB-X-014` | Act 2 — vibration spike |
| `EA1.CHAMBER.VIBRATION_Y` | `EA1-027-CC-VIB-Y-022` | Act 5 — second-sensor cluster |
| `HL1.PREBURNER.CHAMBER_PSI` | `HL1-2-PB-PRES-002` | Act 3 — pressure drift |
| `LH0.TURBOPUMP.BEARING_TEMP_C` | `LH0-031-TP-TEMP-007` | Act 4 — temp excursion |

These four `sensor_id`s are the canonical, deterministic anomaly targets
(`bin/generate-sensors.mjs`). The shipped EA-1 sim target drives the two
EA1-027 vibration channels (the bearing-race story). Wire more rows for
your own targets/sensors.

## Running it

The COSMOS plugin, build/install steps, and compose overlay live in
`apps/telemetry-bridge/cosmos/` — see that directory's `README.md`. In
short:

```bash
# 1. bring up COSMOS (its own compose stack)
./openc3.sh run                     # http://localhost:2900

# 2. build + install the EA-1 plugin (Admin → Plugins)
#    apps/telemetry-bridge/cosmos/openc3-cosmos-ea1-demo

# 3. point the bridge at COSMOS
export BRIDGE_SOURCE=cosmos
export COSMOS_WS_URL=ws://localhost:2900/openc3-api/cable
export COSMOS_TOKEN=<admin password>
pnpm --filter @synapcores/telemetry-bridge start
```

`BRIDGE_SOURCE=mock` (default) keeps the Web Worker simulator. The
`/ingest` WebSocket stays open in both modes, so the mock and a live COSMOS
stream can run side by side.

## Status & open items

- **Adapter + wiring:** implemented and type-clean (`src/cosmos.ts`,
  `src/index.ts`, `config/cosmos-map.json`).
- **COSMOS sim target:** written (`cosmos/openc3-cosmos-ea1-demo`). The
  Ruby follows the documented `SimulatedTarget` pattern; **smoke-test it
  against your COSMOS version** — the sim base API has shifted slightly
  across COSMOS releases. End-to-end validation requires a running COSMOS,
  which is a runtime step, not part of this checkout.
- **Auth:** COSMOS has its own auth; `COSMOS_TOKEN` carries the API
  password. For a shared deploy, mint a service-account token rather than
  reusing the admin password.
- **Rate / step-detector note:** the bridge's pressure step-detector
  assumes 100 Hz when converting slope to per-second. If you run COSMOS at
  10 Hz, the EA-1 vibration (z-score) story is unaffected, but the HL1-2
  pressure (step) slope would read ~10× high — keep `EMIT_RATE = 1`
  (100 Hz) or adjust the slope scaling in `src/detection.ts`.
- **Subscription scale:** the demo maps a handful of items. A full
  3000-channel subscribe is plausible (Redis-stream fan-out), but confirm
  COSMOS subscription behavior before committing to that breadth.
