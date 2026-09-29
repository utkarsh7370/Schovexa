# Build from the repo root: docker build -f apps/api/Dockerfile .
# (needs the whole workspace — apps/api depends on the @schovexa/types
# and @schovexa/validation workspace packages).

FROM node:20-alpine AS build
WORKDIR /app

COPY . .
RUN npm ci

RUN npm run build -w @schovexa/types \
 && npm run build -w @schovexa/validation \
 && npx prisma generate --schema apps/api/prisma/schema.prisma \
 && npm run build -w @schovexa/api \
 && npm prune --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/types/package.json ./packages/types/package.json
COPY --from=build /app/packages/types/dist ./packages/types/dist
COPY --from=build /app/packages/validation/package.json ./packages/validation/package.json
COPY --from=build /app/packages/validation/dist ./packages/validation/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma

WORKDIR /app/apps/api
EXPOSE 4000

# Applies any pending migrations before serving — safe to run on every
# boot since a fully-migrated database is a no-op.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
