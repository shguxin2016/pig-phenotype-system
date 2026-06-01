FROM docker.m.daocloud.io/library/node:20-alpine AS build

WORKDIR /app

# 复制 shared 包并构建
COPY packages/shared ./packages/shared
RUN cd packages/shared && npm ci --ignore-scripts && npm run build
RUN cd packages/shared && npm pack --silent && mv ./*.tgz /tmp/pig-shared.tgz

# 复制 API 依赖文件
COPY apps/api/package.json apps/api/package-lock.json ./apps/api/
RUN cd apps/api && npm ci

# 安装 shared 包（先删除可能存在的文件）
RUN cd apps/api && rm -rf node_modules/@shapcd 2>/dev/null || true
RUN cd apps/api && npm install --no-save /tmp/pig-shared.tgz

# 逐个复制 API 源代码文件（避免覆盖 node_modules）
COPY apps/api/src ./apps/api/src
COPY apps/api/tsconfig.json ./apps/api/tsconfig.json
COPY apps/api/nest-cli.json ./apps/api/nest-cli.json

# 构建 API
RUN cd apps/api && npm run build && npm prune --omit=dev

FROM node:20-alpine AS runner

WORKDIR /app

# 复制构建产物
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json ./package.json

EXPOSE 3001

CMD ["node", "dist/main"]
