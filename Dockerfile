FROM node:24.13.0-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/voice-provider/package.json packages/voice-provider/package.json
RUN npm ci
COPY . .

FROM dependencies AS development
USER node
CMD ["npm", "run", "dev:api"]

FROM dependencies AS build
RUN npm run typecheck && npm run build

FROM build AS production-dependencies
RUN npm prune --omit=dev

FROM node:24.13.0-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/apps/web/dist ./apps/web/dist
COPY --from=build --chown=node:node /app/packages/database/migrations ./packages/database/migrations
COPY --from=build --chown=node:node /app/scripts/serve-web.mjs ./scripts/serve-web.mjs
USER node
CMD ["node", "dist/api.cjs"]
