# Task 12：内网部署加固设计（Docker Compose + Nginx TLS + PostgreSQL）

## 1. 范围与目标

为“表型测定记录管理系统”提供可复现、可迁移的内网部署方案与安全基线：

- 运行形态：Docker Compose（推荐）
- 反向代理：Nginx 终止 TLS（HTTPS）
- 数据库：PostgreSQL

目标能力：

- 一键启动/停止/升级（保持数据）
- 配置分层（dev/staging/prod）
- 不在日志中暴露敏感信息
- 基础安全控制（最小权限、HTTP 安全头、上传限制、健康检查、备份/恢复）

## 2. 部署拓扑

- `nginx`（对外 443/80）
  - 443 TLS 终止
  - 反代 `web`（Next.js）与 `api`（NestJS）
- `web`（Next.js 生产模式 `next start`）
  - 内部端口 3000
  - 通过 `NEXT_PUBLIC_API_BASE_URL` 访问 api（推荐使用同域 `/api` 反代）
- `api`（NestJS `node dist/main`）
  - 内部端口 3001
  - CORS：生产建议限制 origin（不使用 `origin:true`）
- `db`（PostgreSQL）
  - 内部端口 5432
  - 数据持久化 volume

## 3. 配置与密钥管理

### 3.1 必要环境变量

API：

- `NODE_ENV=production`
- `PORT=3001`
- `DB_TYPE=postgres`
- `DB_HOST=db`
- `DB_PORT=5432`
- `DB_USERNAME=...`
- `DB_PASSWORD=...`（仅在 env 文件中）
- `DB_DATABASE=...`
- `JWT_SECRET=...`（必须强随机）
- `ADMIN_USERNAME=admin`（初始化用）
- `ADMIN_INIT_PASSWORD=...`（初始化用，首次启动后建议重置）

Web：

- `NODE_ENV=production`
- `PORT=3000`
- `NEXT_PUBLIC_API_BASE_URL=/api`（推荐同域反代）

Nginx：

- `SERVER_NAME=...`（域名或 IP）
- `TLS_CERT_PATH=/etc/nginx/certs/tls.crt`
- `TLS_KEY_PATH=/etc/nginx/certs/tls.key`

### 3.2 机密建议

- `.env` 文件仅部署机器保存，不进入仓库
- `JWT_SECRET` 以 32+ 字节随机生成
- 数据库密码与管理员初始密码与 JWT_SECRET 分离

## 4. 安全基线

### 4.1 网络与访问控制

- DB 不对外暴露端口（仅 compose 内网访问）
- Nginx 仅暴露 80/443
- 可选：Nginx 做 IP 白名单（内网网段）或 Basic Auth（第二道门）

### 4.2 HTTPS 与安全头

- 强制 443，80 自动跳转
- Nginx 增加安全头：
  - `Strict-Transport-Security`（若确认全站 HTTPS）
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: no-referrer`

### 4.3 API 防护

- 生产 CORS：只允许 `https://<SERVER_NAME>`
- 上传大小限制（Excel 导入）：Nginx 与 NestJS 双层限制
- 请求日志：禁止打印 token、密码、JWT_SECRET 等

### 4.4 数据库

- 最小权限账号（仅该库）
- 定期备份（pg_dump）与恢复文档
- 可选：开启 WAL 归档（后续）

## 5. 可观测性与运维

- 健康检查：
  - `GET /api/health`（新增）
  - `GET /health`（Nginx 返回 200）
- 日志：
  - Docker logs 为主
  - Nginx access/error log
- 升级策略：
  - 拉取新镜像 → `docker compose up -d`（保留 volume）

## 6. 数据迁移/初始化

- 首次启动自动执行：
  - TypeORM schema sync/迁移（当前项目若用 sync，需要显式说明；建议后续补迁移）
  - seed：初始化单位/品种与管理单位账号（已存在 seed.service）
- 明确“重复启动不会重复插入/破坏数据”的幂等性

## 7. 交付物清单（代码/配置）

- `deploy/docker-compose.yml`
- `deploy/nginx/nginx.conf`
- `deploy/nginx/conf.d/app.conf`
- `deploy/.env.example`（示例，不含真实密钥）
- `apps/api`：
  - 生产配置：CORS 限制、上传限制
  - `/health` 端点
- `apps/web`：
  - 生产环境 `NEXT_PUBLIC_API_BASE_URL=/api` 默认

