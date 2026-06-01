# 部署（内网加固版）

## 目标

- Docker Compose 一键启动：`nginx(web+api 反代 + TLS)`、`web`、`api`、`postgres`
- 数据持久化：Postgres 使用 volume
- 安全基线：HTTPS、基础安全头、上传大小限制、健康检查、备份脚本

## 前置条件

- 安装 Docker 与 Docker Compose

## 1. 初始化配置

在 `deploy/` 目录中准备 `.env`：

```bash
cd /workspace/deploy
cp .env.example .env
```

编辑 `.env`，至少修改：

- `POSTGRES_PASSWORD`
- `JWT_SECRET`（建议 32+ 字节随机）
- `ADMIN_INIT_PASSWORD`
- `SERVER_NAME`（域名或内网 IP）

## 2. 生成自签 TLS 证书（推荐内网）

在 `deploy/` 下执行：

```bash
mkdir -p certs
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout certs/tls.key \
  -out certs/tls.crt \
  -days 3650 \
  -subj "/CN=${SERVER_NAME}"
```

## 3. 启动/停止

启动：

```bash
cd /workspace/deploy
docker compose up -d --build
```

查看日志：

```bash
docker compose logs -f
```

停止（保留数据）：

```bash
docker compose down
```

停止并删除数据（谨慎）：

```bash
docker compose down -v
```

## 4. 健康检查

- Nginx：`https://<SERVER_NAME>/health`
- API：`https://<SERVER_NAME>/api/health`

## 5. 备份与恢复

备份：

```bash
cd /workspace/deploy
set -a; source .env; set +a
./scripts/backup.sh ./backups
```

恢复（示例）：

```bash
cd /workspace/deploy
set -a; source .env; set +a
cat ./backups/db_YYYYMMDD_HHMMSS.sql | docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

