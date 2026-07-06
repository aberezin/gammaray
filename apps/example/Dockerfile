FROM node:22-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace files and root configs
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.json ./
COPY packages ./packages
COPY apps/example ./apps/example

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build schema packages that are not in transpilePackages (Next.js needs their dist/)
RUN pnpm --filter @gammaray/core build && \
    pnpm --filter @gammaray/rolodex-schema build

# Expose port 3000
EXPOSE 3000

# Set environment
ENV NODE_ENV=development
ENV PORT=3000

# Start the development server
CMD ["pnpm", "--filter", "@gammaray/example", "dev"]
