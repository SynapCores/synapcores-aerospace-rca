# telemetry-bridge. Self-contained — no workspace deps (only `ws` + `tsx`),
# so build context = this directory and a plain `npm install` is enough:
#   docker build -t aero-bridge apps/telemetry-bridge
# (the bundled docker-compose.yml does this for you).

FROM node:22-slim

WORKDIR /bridge

# Only package.json is needed to resolve ws + tsx (no lockfile committed).
COPY package.json ./
RUN npm install --no-audit --no-fund

# Copy sources. We intentionally do NOT copy tsconfig.json — it extends a
# repo-root base that isn't in this build context, and tsx runs TS directly
# without needing it.
COPY src ./src
COPY config ./config
COPY bin ./bin
RUN chmod +x ./bin/docker-entrypoint.sh

EXPOSE 4005
ENTRYPOINT ["./bin/docker-entrypoint.sh"]
