/**
 * OpenC3 COSMOS adapter — Track C (Task #416).
 *
 * Lets the bridge ingest telemetry from a real OpenC3 COSMOS ground
 * system instead of (or alongside) the in-browser Web Worker simulator.
 * The bridge's internal stream shape is unchanged: this module is a thin
 * translator from a COSMOS realtime item stream → the bridge's `Sample[]`.
 *
 * Protocol (verified against docs.openc3.com/docs/development/streaming-api):
 *
 *   COSMOS exposes its Streaming API over ActionCable (Rails WebSockets)
 *   at  ws://<host>/openc3-api/cable . It is NOT a plain JSON packet
 *   stream — you ride the ActionCable envelope:
 *
 *     1. connect           → server sends {"type":"welcome"}
 *     2. subscribe         → client sends
 *          {"command":"subscribe","identifier":
 *             "{\"channel\":\"StreamingChannel\",\"scope\":\"DEFAULT\",\"token\":\"...\"}"}
 *        server replies     {"type":"confirm_subscription","identifier":...}
 *     3. add items         → client sends
 *          {"command":"message","identifier":...,
 *           "data":"{\"action\":\"add\",\"scope\":\"DEFAULT\",\"token\":\"...\",
 *                    \"items\":[[\"DECOM__TLM__TGT__PKT__ITEM__CONVERTED\",\"alias\"],...]}"}
 *     4. realtime results  → server sends
 *          {"identifier":...,"message":{"__type":"ITEMS","__time":<ns>,"alias":<value>,...}}
 *        (message may also be an ARRAY of such objects when batched)
 *
 *   Realtime = omit start_time/end_time. COSMOS streams every packet at
 *   full rate on this path; REDUCED mode (historical aggregation) is a
 *   separate, opt-in concern we don't use here. See HANDOFF Track C.
 *
 * Item keys: we subscribe each item with an explicit short alias (the
 * second tuple element). COSMOS then keys the inbound message by that
 * alias, so parsing is a direct alias → sensor_id lookup with no string
 * surgery on the hot path.
 */

import WebSocket from 'ws';
import type { Sample } from './types.js';

/** alias (e.g. "EA1.TURBOPUMP.VIBRATION_RMS") → registry sensor_id. */
export type CosmosItemMap = Record<string, string>;

export interface CosmosAdapterOptions {
  /** Full cable URL, e.g. ws://cosmos:2900/openc3-api/cable */
  cableUrl: string;
  /** COSMOS scope. OSS default is "DEFAULT". */
  scope: string;
  /** Auth token / API password. COSMOS rejects the subscription without it. */
  token: string;
  /** alias → sensor_id. Items absent from this map are ignored. */
  itemMap: CosmosItemMap;
  /** Reconnect backoff ceiling (ms). */
  maxBackoffMs?: number;
}

export interface CosmosAdapter {
  stop(): void;
}

/** One inbound COSMOS realtime item-set. */
interface CosmosItemsMessage {
  __type?: string;
  __time?: number; // nanoseconds since epoch
  [alias: string]: unknown;
}

/**
 * Start the adapter. `onBatch` is invoked once per inbound COSMOS message
 * with the translated samples and a wall-clock-ms timestamp. Wire it to
 * `bridge.ingest({ type: 'samples', ts, samples })`.
 *
 * The returned handle's stop() tears down the socket and cancels any
 * pending reconnect.
 */
export function startCosmosAdapter(
  opts: CosmosAdapterOptions,
  onBatch: (samples: Sample[], tsMs: number) => void,
): CosmosAdapter {
  const maxBackoff = opts.maxBackoffMs ?? 30_000;
  const identifier = JSON.stringify({
    channel: 'StreamingChannel',
    scope: opts.scope,
    token: opts.token,
  });
  // Build the subscription item tuples once: alias → DECOM converted key.
  const items = Object.keys(opts.itemMap).map((alias) => [
    `DECOM__TLM__${alias.replace(/\./g, '__')}__CONVERTED`,
    alias,
  ]);
  const mappedAliases = new Set(Object.keys(opts.itemMap));

  let ws: WebSocket | null = null;
  let backoff = 1_000;
  let stopped = false;
  let reconnectTimer: NodeJS.Timeout | null = null;
  // Throttle "unmapped item" warnings so a chatty target can't flood logs.
  const warnedUnmapped = new Set<string>();

  const connect = (): void => {
    if (stopped) return;
    console.log(`[cosmos] connecting → ${opts.cableUrl}`);
    const sock = new WebSocket(opts.cableUrl);
    ws = sock;

    sock.on('open', () => {
      console.log('[cosmos] socket open — awaiting ActionCable welcome');
    });

    sock.on('message', (raw) => {
      let env: { type?: string; identifier?: string; message?: unknown };
      try {
        env = JSON.parse(raw.toString());
      } catch {
        return; // non-JSON frame — ignore
      }

      switch (env.type) {
        case 'welcome':
          // Server is ready; subscribe to the StreamingChannel.
          sock.send(JSON.stringify({ command: 'subscribe', identifier }));
          return;
        case 'confirm_subscription':
          // Subscription accepted; now request the realtime items.
          backoff = 1_000; // healthy connection — reset backoff
          sock.send(
            JSON.stringify({
              command: 'message',
              identifier,
              data: JSON.stringify({
                action: 'add',
                scope: opts.scope,
                token: opts.token,
                items,
              }),
            }),
          );
          console.log(
            `[cosmos] subscription confirmed — requested ${items.length} items`,
          );
          return;
        case 'reject_subscription':
          console.error(
            '[cosmos] subscription REJECTED — check COSMOS_TOKEN / scope. Closing.',
          );
          sock.close();
          return;
        case 'ping':
        case 'disconnect':
          return; // ActionCable keepalive / server-initiated disconnect
        default:
          break;
      }

      // Data frame: { identifier, message: <ITEMS> | <ITEMS[]> }
      if (env.message == null) return;
      const payloads = Array.isArray(env.message) ? env.message : [env.message];
      for (const p of payloads) {
        translate(p as CosmosItemsMessage);
      }
    });

    sock.on('close', () => {
      if (stopped) return;
      console.warn(`[cosmos] socket closed — reconnecting in ${backoff}ms`);
      scheduleReconnect();
    });

    sock.on('error', (e) => {
      console.warn(`[cosmos] socket error: ${(e as Error).message}`);
      // 'close' fires after 'error'; reconnect is handled there.
    });
  };

  const translate = (msg: CosmosItemsMessage): void => {
    if (msg.__type !== 'ITEMS') return;
    const tsMs =
      typeof msg.__time === 'number'
        ? Math.round(msg.__time / 1e6) // ns → ms
        : Date.now();
    const samples: Sample[] = [];
    for (const key of Object.keys(msg)) {
      if (key === '__type' || key === '__time') continue;
      const sensorId = opts.itemMap[key];
      if (!sensorId) {
        if (!warnedUnmapped.has(key) && mappedAliases.size > 0) {
          warnedUnmapped.add(key);
          console.warn(`[cosmos] item '${key}' has no sensor_id mapping — ignoring`);
        }
        continue;
      }
      const value = Number(msg[key]);
      if (!Number.isFinite(value)) continue; // string-state items (e.g. "ENABLED")
      samples.push({ sensor_id: sensorId, value });
    }
    if (samples.length > 0) onBatch(samples, tsMs);
  };

  const scheduleReconnect = (): void => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, maxBackoff);
  };

  connect();

  return {
    stop(): void {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      if (ws) {
        ws.removeAllListeners();
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        ws = null;
      }
      console.log('[cosmos] adapter stopped');
    },
  };
}
