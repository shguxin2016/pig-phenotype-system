FROM docker.m.daocloud.io/library/node:20-alpine AS build

WORKDIR /app

ARG NEXT_PUBLIC_API_BASE_URL=/api

COPY packages/shared ./packages/shared
RUN cd packages/shared && npm ci --ignore-scripts
RUN cd packages/shared && npm run build

COPY apps/web/package.json apps/web/package-lock.json ./apps/web/
RUN cd apps/web && npm ci

COPY packages/shared ./packages/shared
RUN cd packages/shared && npm run build

COPY apps/web ./apps/web
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
RUN cd apps/web && npm run build && npm prune --omit=dev

FROM node:20-alpine AS runner

WORKDIR /app/apps/web
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/apps/web/.next ./.next
COPY --from=build /app/apps/web/public ./public
COPY --from=build /app/apps/web/node_modules ./node_modules
COPY --from=build /app/apps/web/package.json ./package.json

USER node
EXPOSE 3000

CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000"]
