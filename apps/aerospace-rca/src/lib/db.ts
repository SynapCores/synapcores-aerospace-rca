/**
 * Database access for aerospace-rca via the official `@synapcores/sdk`.
 *
 * The SDK is the recommended path for Node.js / TypeScript apps that
 * integrate with SynapCores AIDB. It handles auth, retries, the
 * response-envelope unwrap, and types — so applications don't have to
 * re-implement the wire protocol.
 *
 * This module wraps the SDK in a thin shim that returns rows as
 * keyed objects (e.g. `row.unit_id`) rather than positional tuples
 * (`row[0]`), so existing code reads naturally. The SDK itself
 * returns rows as `any[][]` per the gateway's wire format — we map
 * via the column-name index right here.
 *
 * Public surface unchanged:
 *   db().sql<Row>(statement, params?)  →  { columns, rows: Row[], ... }
 */

import 'server-only';

import { SynapCores } from '@synapcores/sdk';

export interface QueryColumn {
  name: string;
  data_type: string;
  nullable: boolean;
}

export interface QueryResult<Row = Record<string, unknown>> {
  columns: QueryColumn[];
  rows: Row[];
  rows_affected?: number;
  execution_time_ms: number;
}

/**
 * Thin wrapper around `@synapcores/sdk`'s SynapCores client that
 * returns SQL rows as keyed objects instead of positional tuples.
 */
export class AerospaceRcaClient {
  private readonly sdk: SynapCores;
  private readonly timeoutSecs: number;

  constructor(opts: { baseUrl: string; apiKey: string; timeoutMs?: number }) {
    const url = new URL(opts.baseUrl);
    const useHttps = url.protocol === 'https:';
    this.sdk = new SynapCores({
      host: url.hostname,
      port: Number(url.port) || (useHttps ? 443 : 80),
      apiKey: opts.apiKey,
      useHttps,
      timeout: opts.timeoutMs ?? 60_000,
    });
    this.timeoutSecs = Math.ceil((opts.timeoutMs ?? 60_000) / 1000);
  }

  /**
   * Execute a SQL statement with optional bound parameters.
   *
   * Rows come back as objects keyed by column name, e.g.
   *   const r = await c.sql<{id: string; days_open: number}>(
   *     'SELECT id, days_open FROM rfas WHERE status = $1',
   *     ['open'],
   *   );
   *   r.rows[0].days_open   // → number
   */
  async sql<Row = Record<string, unknown>>(
    statement: string,
    params: ReadonlyArray<unknown> = [],
  ): Promise<QueryResult<Row>> {
    const raw = await this.sdk.executeQuery({
      sql: statement,
      parameters: params.length === 0 ? undefined : (params as unknown[]),
      timeout_secs: this.timeoutSecs,
    });
    return shapeResult<Row>(raw);
  }

  /** Convenience: return the first column of the first row, or null. */
  async sqlScalar<T = unknown>(
    statement: string,
    params: ReadonlyArray<unknown> = [],
  ): Promise<T | null> {
    const result = await this.sql<Record<string, T>>(statement, params);
    const firstRow = result.rows[0];
    if (!firstRow) return null;
    const firstColumn = result.columns[0];
    if (!firstColumn) return null;
    return firstRow[firstColumn.name] ?? null;
  }

  /** Health check via the SDK's system client. */
  async health(): Promise<{ ok: boolean; version?: string }> {
    try {
      const status = await this.sdk.system.status();
      const v = (status as { version?: string } | undefined)?.version;
      return { ok: true, version: v };
    } catch {
      return { ok: false };
    }
  }

  /** Escape hatch for advanced SDK features (graph, recipes, etc.). */
  get raw(): SynapCores {
    return this.sdk;
  }
}

function shapeResult<Row>(raw: {
  columns: QueryColumn[];
  rows: unknown[][];
  rows_affected?: number;
  execution_time_ms: number;
}): QueryResult<Row> {
  const columns = raw.columns ?? [];
  const rows = (raw.rows ?? []).map((tuple) => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < columns.length; i++) {
      obj[columns[i].name] = tuple[i];
    }
    return obj as Row;
  });
  return {
    columns,
    rows,
    rows_affected: raw.rows_affected,
    execution_time_ms: raw.execution_time_ms,
  };
}

let cached: AerospaceRcaClient | null = null;

/**
 * Process-scoped AIDB client. Constructed lazily on first call so the
 * env vars don't have to be set at module-import time (Next.js evaluates
 * server modules during build).
 */
export function db(): AerospaceRcaClient {
  if (cached) return cached;
  const apiKey = process.env.SYNAPCORES_ADMIN_API_KEY;
  if (!apiKey) {
    throw new Error(
      '[aerospace-rca] SYNAPCORES_ADMIN_API_KEY is not set. See README.',
    );
  }
  cached = new AerospaceRcaClient({
    baseUrl: process.env.SYNAPCORES_URL ?? 'http://127.0.0.1:8081',
    apiKey,
    timeoutMs: 60_000,
  });
  return cached;
}

/**
 * Today's anomaly — the EA-1 unit 027 bearing incident the demo plays
 * back. Tracked as a constant so the demo page, reset endpoint, and
 * detail page agree on which row is "today".
 */
export const TODAY_ANOMALY_ID = 'ANM-2026-EA1-027';

/** Single demo tenant — used by the immutable audit chain. */
export const DEMO_TENANT = 'demo-aero';
