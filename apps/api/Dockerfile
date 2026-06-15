# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace files
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages ./packages
COPY apps/api ./apps/api

# Install dependencies and build packages in dependency order
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @gammaray/core build
RUN pnpm --filter @gammaray/auth build
RUN pnpm --filter @gammaray/database build
RUN pnpm --filter @gammaray/api build

# Runtime stage
FROM node:22-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace and dependencies from builder
COPY --from=builder /app ./

# Expose port (can be overridden with API_PORT env var)
EXPOSE 3001

# Set environment
ENV NODE_ENV=development

# Run migrations and start the app
CMD ["sh", "-c", "pnpm --filter @gammaray/database db:migrate && pnpm --filter @gammaray/api dev"]
