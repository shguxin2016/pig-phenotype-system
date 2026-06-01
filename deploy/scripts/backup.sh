#!/usr/bin/env bash
set -euo pipefail

ts=$(date +%Y%m%d_%H%M%S)
out_dir=${1:-./backups}
mkdir -p "$out_dir"

docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" > "$out_dir/db_$ts.sql"
echo "Backup written to $out_dir/db_$ts.sql"

