# syntax=docker/dockerfile:1
#
# Aerospace-RCA Next.js app.
#
# Build context = REPO ROOT (pnpm workspace; the app depends on the vendored
# @synapcores/app-framework via workspace:*):
#
#   docker build -f apps/aerospace-rca/Dockerfile -t ghcr.io/synapcores/aerospace-rca:dev .
#
# Multi-stage: the previous single-stage build shipped the full workspace
# node_modules plus all sources in the runtime layer (1.72 GB).

# ---------- deps ----------
FROM node:22-slim AS deps
# pnpm 9 deliberately: pnpm 10+ blocks dependency build scripts by default and
# exits non-zero (ERR_PNPM_IGNORED_BUILDS for esbuild/sharp), which the build needs.
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
COPY . .
# No lockfile is committed, so --frozen-lockfile cannot be used here.
RUN pnpm install --no-frozen-lockfile

# ---------- build ----------
FROM deps AS build
# NODE_ENV stays unset: typescript/tailwind are devDependencies the build needs.
RUN pnpm --filter @synapcores/aerospace-rca build

# ---------- runtime ----------
FROM node:22-slim AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3005
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/apps/aerospace-rca/.next/standalone ./
COPY --from=build /app/apps/aerospace-rca/.next/static ./apps/aerospace-rca/.next/static

# The entrypoint logs in, applies schema and seeds the demo corpus at start,
# so the bin scripts and their seed data must be present. All of them import
# only node: builtins.
COPY --from=build /app/apps/aerospace-rca/bin ./apps/aerospace-rca/bin
COPY --from=build /app/apps/aerospace-rca/src/lib ./apps/aerospace-rca/src/lib

WORKDIR /app/apps/aerospace-rca
RUN chmod +x ./bin/docker-entrypoint.sh

EXPOSE 3005
HEALTHCHECK --interval=15s --timeout=4s --start-period=60s --retries=5 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/" >/dev/null || exit 1

ENTRYPOINT ["./bin/docker-entrypoint.sh"]
