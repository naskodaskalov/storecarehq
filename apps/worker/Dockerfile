# Worker image: Node 22 + Chromium for the checkout test. Build from the repo root:
#   docker build -f apps/worker/Dockerfile -t storecare-worker .
FROM mcr.microsoft.com/playwright:v1.63.0-noble

WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/storefront/package.json packages/storefront/
COPY apps/worker/package.json apps/worker/
RUN npm ci --workspace @storecare/worker --include-workspace-root=false --omit=dev

COPY tsconfig.base.json ./
COPY packages/storefront packages/storefront
COPY apps/worker apps/worker

ENV NODE_ENV=production
WORKDIR /app/apps/worker
CMD ["node", "src/index.ts"]
