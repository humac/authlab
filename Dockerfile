# ── Stage 1: Install dependencies ────────────────────────────────────
FROM node:22-slim AS deps

RUN apt-get update && apt-get install -y \
    python3 make g++ openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma/

RUN npm ci

# ── Stage 2: Build the application ──────────────────────────────────
FROM node:22-slim AS builder

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npx prisma generate
RUN npm run build -- --webpack

# ── Stage 3: Production runner ──────────────────────────────────────
FROM node:22-slim AS runner

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone server output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma generated client (required at runtime)
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/prisma/schema.prisma ./prisma/schema.prisma

# Copy native modules needed at runtime
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=builder /app/node_modules/argon2 ./node_modules/argon2
COPY --from=builder /app/node_modules/sharp ./node_modules/sharp

# Data directory for SQLite (dev/self-hosted mode)
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
