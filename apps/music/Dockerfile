FROM node:22-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace files and root configs
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.json ./
COPY packages ./packages
COPY apps/music ./apps/music

# Install dependencies
RUN pnpm install --frozen-lockfile

# Expose port 3010
EXPOSE 3010

# Set environment
ENV NODE_ENV=development
ENV PORT=3010

# Start the development server
CMD ["pnpm", "--filter", "@gammaray/music", "dev"]
