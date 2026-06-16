FROM node:22-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy only package management files
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.json ./
COPY packages ./packages
COPY apps/api ./apps/api

# Install dependencies (will use volume-mounted node_modules in dev)
RUN pnpm install --frozen-lockfile

# Expose port (can be overridden with API_PORT env var)
EXPOSE 3001

# Set environment
ENV NODE_ENV=development

# Migrate, seed the baseline (idempotent), then start the app
CMD ["sh", "-c", "pnpm --filter @gammaray/database db:migrate && pnpm --filter @gammaray/api db:seed && pnpm --filter @gammaray/api dev"]
