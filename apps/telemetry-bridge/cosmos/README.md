# EA-1 COSMOS demo target

An [OpenC3 COSMOS](https://openc3.com) plugin that emits a simulated EA-1
turbopump telemetry stream with a bearing-race micro-pitting fault, plus
the compose overlay that points the telemetry-bridge at it.

This is the **real-telemetry** path for the aerospace-rca demo: instead of
the in-browser Web Worker simulator, the bridge ingests packets from a
COSMOS ground system over the Streaming API and runs the *same* z-score /
step / debounce detection. See `docs/REAL-TELEMETRY.md` in the
aerospace-rca app for the full integration writeup.

## Layout

```
openc3-cosmos-ea1-demo/
├── plugin.txt                      # target + simulated interface
└── targets/EA1/
    ├── target.txt
    ├── cmd_tlm/ea1_tlm.txt         # TURBOPUMP + CHAMBER packet definitions
    └── lib/ea1_sim.rb              # the fault profile (Act 2 + Act 5)
docker-compose.cosmos.yml           # bridge overlay → BRIDGE_SOURCE=cosmos
```

## 1. Bring up COSMOS

COSMOS is its own compose stack. From an OpenC3 COSMOS checkout
(`git clone https://github.com/OpenC3/cosmos`):

```bash
./openc3.sh run          # starts COSMOS at http://localhost:2900
```

Log in, set the admin password — that password is your `COSMOS_TOKEN`.

## 2. Build & install the EA-1 plugin

From this directory:

```bash
# Build the plugin gem (uses the COSMOS CLI from the running stack)
openc3.sh cli rake build VERSION=1.0.0   # → openc3-cosmos-ea1-demo-1.0.0.gem
```

Then **Admin → Plugins → Install** in the COSMOS UI and upload the gem
(or `openc3.sh cli load openc3-cosmos-ea1-demo-1.0.0.gem`). The `EA1`
target should appear and start emitting `TURBOPUMP` / `CHAMBER` packets.
Watch them in **Telemetry Grapher** on `EA1 TURBOPUMP VIBRATION_RMS`.

> The sim emits at 100 Hz (`EMIT_RATE = 1` in `ea1_sim.rb`) to match the
> mock and keep the storyboard timing intact. COSMOS streams this at full
> rate — the ~1–10 Hz figure people cite is flight downlink / display
> refresh, not a COSMOS limit (see `apps/aerospace-rca/docs/REAL-TELEMETRY.md`).
> Drop to 10 Hz by
> setting `EMIT_RATE = 10` if you want a more typical rate.

## 3. Point the bridge at COSMOS

```bash
export BRIDGE_SOURCE=cosmos
export COSMOS_WS_URL=ws://localhost:2900/openc3-api/cable
export COSMOS_TOKEN=<the password from step 1>
pnpm --filter @synapcores/telemetry-bridge start
```

or with compose (overlay on the Track A base):

```bash
docker compose -f docker-compose.yml -f cosmos/docker-compose.cosmos.yml up
```

The bridge subscribes to the items in `config/cosmos-map.json`, translates
each COSMOS packet into its internal sample, and the detector fires the
Act 2 vibration spike (~30 s after the target connects) and the Act 5
chamber-mount cluster (~45 s), promoting a live anomaly into the U1 table
exactly as the mock does.

## Mapping COSMOS items → sensors

`config/cosmos-map.json` (in the bridge root) maps a COSMOS item alias to a
registry `sensor_id`:

```json
{
  "EA1.TURBOPUMP.VIBRATION_RMS": "EA1-027-TP-VIB-X-014",
  "EA1.CHAMBER.VIBRATION_Y":     "EA1-027-CC-VIB-Y-022"
}
```

The alias is `TARGET.PACKET.ITEM`; the bridge subscribes to it as the
COSMOS converted-value key `DECOM__TLM__TARGET__PACKET__ITEM__CONVERTED`.
Any item COSMOS sends that isn't in the map is ignored. Add rows to wire
more channels (e.g. your own targets) to more sensors.
