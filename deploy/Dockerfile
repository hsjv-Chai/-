FROM node:24-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG BASE_PATH=/melon
ENV NEXT_PUBLIC_BASE_PATH=${BASE_PATH}
ENV NODE_OPTIONS=--max-old-space-size=1536
RUN npm run build:ecs

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 MELON_DATA_DIR=/data NEXT_PUBLIC_BASE_PATH=/melon
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --from=build --chown=node:node /app/lib/node-storage.mjs ./lib/node-storage.mjs
COPY --from=build --chown=node:node /app/scripts/init-ecs.mjs ./scripts/init-ecs.mjs
RUN mkdir -p /data .next/cache && chown -R node:node /data .next/cache
USER node
EXPOSE 3000
CMD ["sh","-c","node scripts/init-ecs.mjs && exec node server.js"]
