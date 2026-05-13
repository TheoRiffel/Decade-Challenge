# ---- Build stage ----
FROM node:20-slim AS builder
WORKDIR /build

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# SQL migrations are not emitted by tsc — copy them alongside the compiled runner
RUN cp -r src/db/migrations dist/db/migrations

# ---- Runtime stage ----
FROM node:20-slim AS runtime
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /build/dist ./dist
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["sh", "entrypoint.sh"]
