# Aerospace-RCA Next.js app.
# Build context = REPO ROOT (it's a pnpm workspace; the app depends on the
# vendored @synapcores/app-framework via workspace:*), so build with:
#   docker build -f apps/aerospace-rca/Dockerfile .
# (the bundled docker-compose.yml does this for you).

FROM node:22-slim

# Pin pnpm 9 (README requires >=9). pnpm 10+ blocks dependency build scripts
# by default and exits non-zero in CI (ERR_PNPM_IGNORED_BUILDS for esbuild/
# sharp); pnpm 9 runs them normally, which is what `next build` needs.
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

# Install + build the whole workspace. No lockfile is committed yet, so we
# don't use --frozen-lockfile. Dev deps (typescript/tailwind) are needed
# for `next build`, so NODE_ENV is left unset until after the build.
COPY . .
RUN pnpm install --no-frozen-lockfile \
 && pnpm --filter @synapcores/aerospace-rca build

WORKDIR /app/apps/aerospace-rca
RUN chmod +x ./bin/docker-entrypoint.sh

ENV NODE_ENV=production
EXPOSE 3005
ENTRYPOINT ["./bin/docker-entrypoint.sh"]
