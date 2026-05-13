# ---- Build stage ----
FROM node:20-slim AS builder
WORKDIR /app

# API_URL is baked into the Next.js rewrites at build time
ARG API_URL=http://api:3000
ENV API_URL=${API_URL}

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Runtime stage ----
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# next build --output standalone writes a self-contained server to .next/standalone
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
