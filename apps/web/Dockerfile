# Web (Vite SPA) — monorepo-aware build; context is the REPO ROOT
# (Railway: root directory = repo root, dockerfile path = apps/web/Dockerfile).
#
# VITE_API_URL is a BUILD-time value (Vite bakes it into the bundle). Railway
# passes service variables into Docker builds for any declared ARG, so setting
# VITE_API_URL on the service is enough.

# ---- Build stage ----
FROM node:20-bookworm-slim AS build
WORKDIR /repo

RUN corepack enable

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile --filter @codestack/web... || pnpm install --filter @codestack/web...

COPY apps/web ./apps/web

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm --filter @codestack/web build

# ---- Runtime stage: tiny static server with SPA fallback ----
FROM node:20-bookworm-slim AS runtime
RUN npm install -g serve@14
WORKDIR /app
COPY --from=build /repo/apps/web/dist ./dist

EXPOSE 8080
# Shell form so $PORT (Railway-injected) expands; explicit 0.0.0.0 bind; -s = SPA
# fallback to index.html for client-side routes. exec = clean signal handling.
CMD ["sh", "-c", "exec serve -s dist -l tcp://0.0.0.0:${PORT:-8080}"]
