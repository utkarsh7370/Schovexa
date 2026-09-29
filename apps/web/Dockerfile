# Build from the repo root: docker build -f apps/web/Dockerfile .
# (needs the whole workspace — apps/web depends on the @schovexa/types,
# @schovexa/validation and @schovexa/ui workspace packages).
#
# NEXT_PUBLIC_API_URL is baked into the client bundle at build time (it's
# a NEXT_PUBLIC_ var), so it must be passed as a build arg, not just a
# runtime env var on the container.

FROM node:20-alpine AS build
WORKDIR /app

COPY . .
RUN npm ci

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

RUN npm run build -w @schovexa/types \
 && npm run build -w @schovexa/validation \
 && npm run build -w @schovexa/ui \
 && npm run build -w @schovexa/web

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
