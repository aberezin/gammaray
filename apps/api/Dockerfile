FROM node:22-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy only package management files
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.json ./
COPY packages ./packages
COPY apps/api ./apps/api

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build packages in dependency order so ts-node can resolve @gammaray/* types
RUN pnpm --filter @gammaray/core build && \
    pnpm --filter @gammaray/auth build 2>/dev/null || true && \
    pnpm --filter @gammaray/rolodex-schema build 2>/dev/null || true && \
    pnpm --filter @gammaray/music-schema build 2>/dev/null || true && \
    pnpm --filter @gammaray/database build 2>/dev/null || true

# Expose port (can be overridden with API_PORT env var)
EXPOSE 3001

# Set environment
ENV NODE_ENV=development

# Migrate, seed the baseline (idempotent), then start the app
CMD ["sh", "-c", "pnpm --filter @gammaray/database db:migrate && pnpm --filter @gammaray/api db:seed && pnpm --filter @gammaray/api dev"]
