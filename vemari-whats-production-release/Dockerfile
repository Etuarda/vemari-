FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
ENV CI=true
ENV PRISMA_CLI_BINARY_TARGETS=debian-openssl-3.0.x
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json .npmrc ./
RUN npm ci

FROM dependencies AS node-build
COPY . .
RUN npm run prisma:generate && npm run build:backend

FROM node:22-bookworm-slim AS node-runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl openssl \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --gid 10001 app \
  && useradd --uid 10001 --gid app --shell /usr/sbin/nologin --create-home app
COPY --from=node-build --chown=app:app /app/package.json /app/package-lock.json ./
COPY --from=node-build --chown=app:app /app/node_modules ./node_modules
COPY --from=node-build --chown=app:app /app/dist/backend ./dist/backend
COPY --from=node-build --chown=app:app /app/prisma ./prisma
USER app
CMD ["node", "dist/backend/main-api.js"]

FROM dependencies AS web-build
COPY apps/web apps/web
COPY apps/backend/src/shared/contracts apps/backend/src/shared/contracts
COPY tsconfig.json vite.config.ts ./
RUN npm run build:web

FROM nginx:1.27-alpine AS web-runtime
COPY infra/nginx/web.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1/health || exit 1
