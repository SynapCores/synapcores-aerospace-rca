#!/usr/bin/env node
/**
 * Exchange the pinned admin username/password for a gateway JWT via
 * POST /v1/auth/login, printing ONLY the access_token to stdout:
 *
 *   export SYNAPCORES_ADMIN_API_KEY="$(node bin/aidb-login.mjs)"
 *
 * The engine mints the token (signed with AIDB_JWT_SECRET); nothing is
 * signed client-side. Retries until the gateway is up and the first-boot
 * admin user exists. Diagnostics go to stderr to keep stdout clean.
 */

const BASE = (process.env.SYNAPCORES_URL ?? 'http://127.0.0.1:8081').replace(/\/+$/, '');
const USER = process.env.AIDB_ADMIN_USER ?? 'admin';
const PASS = process.env.AIDB_ADMIN_PASSWORD;
const RETRIES = Number(process.env.AIDB_LOGIN_RETRIES ?? 90);
const DELAY_MS = Number(process.env.AIDB_LOGIN_RETRY_MS ?? 2000);

if (!PASS) {
  console.error('[aidb-login] AIDB_ADMIN_PASSWORD is not set — cannot log in.');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (let attempt = 1; attempt <= RETRIES; attempt++) {
  try {
    const res = await fetch(`${BASE}/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: USER, password: PASS }),
    });
    if (res.ok) {
      const body = await res.json();
      if (body && typeof body.access_token === 'string' && body.access_token) {
        console.error(`[aidb-login] obtained token on attempt ${attempt}`);
        process.stdout.write(body.access_token);
        process.exit(0);
      }
      console.error('[aidb-login] login succeeded but response had no access_token');
    } else {
      console.error(`[aidb-login] attempt ${attempt}/${RETRIES} → HTTP ${res.status} (gateway warming up?)`);
    }
  } catch (e) {
    console.error(`[aidb-login] attempt ${attempt}/${RETRIES} → ${e.message}`);
  }
  await sleep(DELAY_MS);
}

console.error(`[aidb-login] gave up after ${RETRIES} attempts waiting for ${BASE}`);
process.exit(1);
