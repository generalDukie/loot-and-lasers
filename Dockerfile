# syntax=docker/dockerfile:1

FROM node:22-alpine AS client-build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.js tailwind.config.js postcss.config.js jsconfig.json components.json ./
COPY public ./public
COPY src ./src

# Same-origin API in production (served by Express)
ENV VITE_API_URL=
ENV VITE_APP_ID=lootandlasers-local
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app

COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

COPY server/ ./server/
# Node gameplay handlers import shared deterministic rules from the web source
# tree. Keep that source of truth available in the production runtime image.
COPY src/lib ./src/lib
COPY --from=client-build /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=8787
ENV STATIC_DIR=/app/dist
ENV SERVE_STATIC=true
ENV TRUST_PROXY=true
ENV DB_PATH=/app/server/data/game.db

EXPOSE 8787
VOLUME ["/app/server/data"]

WORKDIR /app/server

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8787) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
