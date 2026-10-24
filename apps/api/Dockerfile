# API + background worker image. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t estatery-api .
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @estatery/api...
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @estatery/shared build && pnpm --filter @estatery/api build
# Production-only dependencies plus the built code, without the rest of the monorepo.
RUN pnpm --filter @estatery/api deploy --prod --legacy /out

FROM node:22-alpine AS run
ENV NODE_ENV=production PORT=4000
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app && mkdir -p /app/.uploads && chown app:app /app/.uploads
COPY --from=build --chown=app:app /out ./
USER app
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:4000/health/ready >/dev/null || exit 1
# The same image runs the worker: command ["node", "dist/worker.js"]
CMD ["node", "--enable-source-maps", "dist/main.js"]
