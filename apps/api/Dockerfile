# Monorepo-aware build: the build context is the REPO ROOT (see
# docker-compose.yml's `context: .` / `dockerfile: apps/api/Dockerfile`), so
# the pnpm workspace root files are visible and a filtered install only
# fetches this app's dependencies.

# ---- Build stage ----
FROM node:20-bookworm-slim AS build
WORKDIR /repo

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/package.json
RUN pnpm install --frozen-lockfile --filter @codestack/api... || pnpm install --filter @codestack/api...

COPY apps/api ./apps/api
RUN pnpm --filter @codestack/api build

# ---- Runtime stage ----
FROM node:20-bookworm-slim AS runtime
WORKDIR /repo
ENV NODE_ENV=production
RUN corepack enable

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/package.json
RUN pnpm install --prod --frozen-lockfile --filter @codestack/api... || pnpm install --prod --filter @codestack/api...

COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY apps/api/docker-entrypoint.sh ./apps/api/docker-entrypoint.sh
RUN chmod +x ./apps/api/docker-entrypoint.sh

WORKDIR /repo/apps/api
EXPOSE 3000
# API service: migrate-then-serve (see docker-entrypoint.sh). The worker service
# overrides this CMD with `node dist/worker.js`, so only the API runs migrations.
CMD ["./docker-entrypoint.sh"]
