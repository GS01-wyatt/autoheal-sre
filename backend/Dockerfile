
# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build
WORKDIR /app/backend

# Tools required to compile better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY backend/package.json backend/package-lock.json ./
RUN npm ci

COPY backend/tsconfig.json backend/tsconfig.build.json ./
COPY backend/src ./src
RUN npm run build


FROM node:22-bookworm-slim AS deps
WORKDIR /app/backend

# better-sqlite3 may need native compilation here too
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force


FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=4000 DB_PATH=/data/autoheal.db
WORKDIR /app/backend

COPY --from=deps /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/dist ./dist
COPY backend/package.json ./

# Recovery worker requires this exact path
COPY demo /app/demo

RUN mkdir -p /data && chown node:node /data

USER node
EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4000/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "dist/server.js"]
