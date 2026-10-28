# Worker image: Node 22 (runs TypeScript directly, needs 22.18+) + Chromium for the checkout test.
# Build from the repo root:
#   docker build -f apps/worker/Dockerfile -t storecare-worker .
FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/storefront packages/storefront
COPY apps/worker apps/worker

# Install only the worker's dependencies, then Chromium and the system libraries it needs.
RUN npm ci --workspace @storecare/worker --include-workspace-root=false --omit=dev --no-audit --no-fund \
 && npx playwright install --with-deps chromium \
 && rm -rf /root/.npm /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app/apps/worker
CMD ["node", "src/index.ts"]
