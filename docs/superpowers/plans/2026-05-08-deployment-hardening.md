# Deployment Hardening (Compose + Nginx TLS + Postgres) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为系统提供内网生产部署与安全加固：Docker Compose 编排（web/api/db/nginx）、Nginx TLS 终止与反代、生产环境变量模板、健康检查与基础安全策略。

**Architecture:** 以 `deploy/` 目录作为部署交付物入口。web/api 使用多阶段 Dockerfile 构建生产镜像；Postgres 使用官方镜像并挂载 volume；Nginx 终止 TLS 并将 `/` 反代到 web，将 `/api/` 反代到 api。API 增加 `/health` 端点与生产 CORS 配置。提供 `.env.example` 与备份脚本。

**Tech Stack:** Docker / Docker Compose / Nginx / PostgreSQL / NestJS / Next.js。

---

## File Map

- Create: `/workspace/deploy/README.md`
- Create: `/workspace/deploy/.env.example`
- Create: `/workspace/deploy/docker-compose.yml`
- Create: `/workspace/deploy/nginx/nginx.conf`
- Create: `/workspace/deploy/nginx/conf.d/app.conf`
- Create: `/workspace/deploy/scripts/backup.sh`
- Create: `/workspace/apps/api/Dockerfile`
- Create: `/workspace/apps/web/Dockerfile`
- Modify: `/workspace/apps/api/src/app.controller.ts`（新增 /health 或新增 health.controller.ts）
- Modify: `/workspace/apps/api/src/main.ts`（生产 CORS 限制与上传大小限制）
- (Optional) Create: `/workspace/apps/api/src/health/health.controller.ts` + module wiring

---

## Task 1: Deploy folder scaffolding

**Files:**
- Create: `/workspace/deploy/README.md`
- Create: `/workspace/deploy/.env.example`
- Create: `/workspace/deploy/scripts/backup.sh`

- [ ] **Step 1: Add env example**

Create `/workspace/deploy/.env.example`:

```env
SERVER_NAME=localhost

POSTGRES_DB=pig_system
POSTGRES_USER=pig_system
POSTGRES_PASSWORD=CHANGE_ME

JWT_SECRET=CHANGE_ME_TO_LONG_RANDOM
ADMIN_USERNAME=admin
ADMIN_INIT_PASSWORD=CHANGE_ME

API_PORT=3001
WEB_PORT=3000
NGINX_HTTP_PORT=80
NGINX_HTTPS_PORT=443

TLS_CERT_HOST_PATH=./certs/tls.crt
TLS_KEY_HOST_PATH=./certs/tls.key
```

- [ ] **Step 2: Add deploy README**

Create `/workspace/deploy/README.md` describing:
- prerequisites (docker, compose)
- create certs, fill env
- commands: `docker compose up -d`, `docker compose logs -f`, `docker compose down`
- backup/restore steps

- [ ] **Step 3: Add backup script**

Create `/workspace/deploy/scripts/backup.sh` (non-interactive):

```bash
#!/usr/bin/env bash
set -euo pipefail

ts=$(date +%Y%m%d_%H%M%S)
out_dir=${1:-./backups}
mkdir -p "$out_dir"

docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" > "$out_dir/db_$ts.sql"
echo "Backup written to $out_dir/db_$ts.sql"
```

Notes: Script relies on env variables sourced by user: `set -a; source .env; set +a`.

---

## Task 2: Dockerfiles for api/web

**Files:**
- Create: `/workspace/apps/api/Dockerfile`
- Create: `/workspace/apps/web/Dockerfile`

- [ ] **Step 1: API Dockerfile**

Create `/workspace/apps/api/Dockerfile` (multi-stage):

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
EXPOSE 3001
CMD ["node","dist/main"]
```

- [ ] **Step 2: Web Dockerfile**

Create `/workspace/apps/web/Dockerfile`:

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts ./next.config.ts
EXPOSE 3000
CMD ["npm","run","start","--","-p","3000"]
```

---

## Task 3: Nginx config + Compose

**Files:**
- Create: `/workspace/deploy/nginx/nginx.conf`
- Create: `/workspace/deploy/nginx/conf.d/app.conf`
- Create: `/workspace/deploy/docker-compose.yml`

- [ ] **Step 1: Nginx base config**

Create `/workspace/deploy/nginx/nginx.conf`:

```nginx
worker_processes auto;
events { worker_connections 1024; }
http {
  include       /etc/nginx/mime.types;
  default_type  application/octet-stream;
  sendfile      on;
  keepalive_timeout  65;
  client_max_body_size 10m;
  include /etc/nginx/conf.d/*.conf;
}
```

- [ ] **Step 2: App virtual host**

Create `/workspace/deploy/nginx/conf.d/app.conf`:

```nginx
server {
  listen 80;
  server_name ${SERVER_NAME};
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl;
  server_name ${SERVER_NAME};

  ssl_certificate     /etc/nginx/certs/tls.crt;
  ssl_certificate_key /etc/nginx/certs/tls.key;

  add_header X-Content-Type-Options nosniff always;
  add_header X-Frame-Options DENY always;
  add_header Referrer-Policy no-referrer always;

  location /health {
    return 200 "ok";
    add_header Content-Type text/plain;
  }

  location /api/ {
    proxy_pass http://api:3001/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    proxy_pass http://web:3000/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

- [ ] **Step 3: Compose file**

Create `/workspace/deploy/docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 10

  api:
    build:
      context: ../apps/api
    environment:
      NODE_ENV: production
      PORT: 3001
      DB_TYPE: postgres
      DB_HOST: db
      DB_PORT: 5432
      DB_USERNAME: ${POSTGRES_USER}
      DB_PASSWORD: ${POSTGRES_PASSWORD}
      DB_DATABASE: ${POSTGRES_DB}
      JWT_SECRET: ${JWT_SECRET}
      ADMIN_USERNAME: ${ADMIN_USERNAME}
      ADMIN_INIT_PASSWORD: ${ADMIN_INIT_PASSWORD}
      CORS_ORIGIN: https://${SERVER_NAME}
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:3001/health || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 10

  web:
    build:
      context: ../apps/web
    environment:
      NODE_ENV: production
      PORT: 3000
      NEXT_PUBLIC_API_BASE_URL: /api
    depends_on:
      api:
        condition: service_healthy

  nginx:
    image: nginx:1.27-alpine
    ports:
      - "${NGINX_HTTP_PORT}:80"
      - "${NGINX_HTTPS_PORT}:443"
    environment:
      SERVER_NAME: ${SERVER_NAME}
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - ${TLS_CERT_HOST_PATH}:/etc/nginx/certs/tls.crt:ro
      - ${TLS_KEY_HOST_PATH}:/etc/nginx/certs/tls.key:ro
    depends_on:
      web:
        condition: service_started

volumes:
  pg_data:
```

---

## Task 4: API hardening — health + CORS + upload size

**Files:**
- Modify: `/workspace/apps/api/src/main.ts`
- Modify: `/workspace/apps/api/src/app.controller.ts`

- [ ] **Step 1: Add /health**

Modify `/workspace/apps/api/src/app.controller.ts` to add:

```ts
@Get('health')
health() {
  return { ok: true }
}
```

- [ ] **Step 2: Production CORS**

Modify `/workspace/apps/api/src/main.ts`:
- use `CORS_ORIGIN` env in production
- keep `origin:true` only for dev

Example:

```ts
const origin = process.env.NODE_ENV === 'production' ? (process.env.CORS_ORIGIN ?? false) : true
app.enableCors({ origin, credentials: true })
```

- [ ] **Step 3: Upload size**

When implementing Excel import, also set NestJS body limits (or multer limits) in the excel controller; for now document and set Nginx `client_max_body_size`.

---

## Task 5: Smoke validation (local)

- [ ] **Step 1: Build images**

```bash
cd /workspace/deploy
docker compose --env-file .env build
```

- [ ] **Step 2: Start**

```bash
cd /workspace/deploy
docker compose --env-file .env up -d
```

- [ ] **Step 3: Check health**

```bash
curl -k https://<SERVER_NAME>/health
curl -k https://<SERVER_NAME>/api/health
```

Expected: ok / {ok:true}

---

## Self-Review Checklist (plan)

- 机密不入仓库：只提供 `.env.example`，部署说明强调本机 `.env`
- DB 不对外映射端口
- Nginx 终止 TLS，反代 / 与 /api/
- API 增加 /health 并限制生产 CORS

