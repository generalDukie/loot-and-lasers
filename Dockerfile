# syntax=docker/dockerfile:1

FROM node:22-alpine AS runtime
WORKDIR /app

COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

COPY server/ ./server/
# Shared deterministic game rules used by Node gameplay handlers.
COPY src/lib ./src/lib

ENV NODE_ENV=production
ENV PORT=8787
ENV SERVE_STATIC=false
ENV TRUST_PROXY=true
ENV DB_PATH=/app/server/data/game.db

EXPOSE 8787
VOLUME ["/app/server/data"]

WORKDIR /app/server

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8787) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

COPY docker-entrypoint.sh /docker-entrypoint.sh
# Windows checkouts may ship CRLF; Alpine shebang fails with "no such file".
RUN sed -i 's/\r$//' /docker-entrypoint.sh && chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
