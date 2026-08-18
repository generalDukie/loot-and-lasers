#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="${NODE_API_CONTAINER_NAME:-loot-node-api}"
BACKUP_TAG="${BACKUP_TAG:-lootandlasers-node-api}"
KEEP_DAILY="${BACKUP_KEEP_DAILY:-7}"
KEEP_WEEKLY="${BACKUP_KEEP_WEEKLY:-5}"
KEEP_MONTHLY="${BACKUP_KEEP_MONTHLY:-12}"
LOCAL_RETENTION_DAYS="${BACKUP_LOCAL_RETENTION_DAYS:-2}"
CHECK_SUBSET="${BACKUP_CHECK_SUBSET:-5%}"
LOCK_FILE="${BACKUP_LOCK_FILE:-/run/lock/lootandlasers-node-backup.lock}"

if [[ -z "${RESTIC_REPOSITORY:-}" ]]; then
  echo "RESTIC_REPOSITORY is required" >&2
  exit 2
fi
if [[ -z "${RESTIC_PASSWORD:-}" && -z "${RESTIC_PASSWORD_FILE:-}" ]]; then
  echo "RESTIC_PASSWORD or RESTIC_PASSWORD_FILE is required" >&2
  exit 2
fi
command -v docker >/dev/null
command -v restic >/dev/null
command -v flock >/dev/null

mkdir -p "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
flock -n 9 || { echo "Backup already running"; exit 0; }

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
snapshot_name="node-api-${timestamp}.db"
container_snapshot="/app/server/data/backups/${snapshot_name}"

docker exec "$CONTAINER_NAME" \
  node scripts/snapshot-db.mjs --out "$container_snapshot"

data_dir="$(docker inspect "$CONTAINER_NAME" --format '{{range .Mounts}}{{if eq .Destination "/app/server/data"}}{{.Source}}{{end}}{{end}}')"
if [[ -z "$data_dir" || "$data_dir" != /* ]]; then
  echo "Could not resolve the container's /app/server/data mount" >&2
  exit 3
fi
snapshot_path="${data_dir}/backups/${snapshot_name}"
checksum_path="${snapshot_path}.sha256"
if [[ ! -f "$snapshot_path" || ! -f "$checksum_path" ]]; then
  echo "Snapshot or checksum missing under the resolved data mount" >&2
  exit 3
fi

restic backup "$snapshot_path" "$checksum_path" --tag "$BACKUP_TAG"
restic forget --prune \
  --tag "$BACKUP_TAG" \
  --keep-daily "$KEEP_DAILY" \
  --keep-weekly "$KEEP_WEEKLY" \
  --keep-monthly "$KEEP_MONTHLY"
restic check --read-data-subset="$CHECK_SUBSET"

find "${data_dir}/backups" -maxdepth 1 -type f \
  \( -name 'node-api-*.db' -o -name 'node-api-*.db.sha256' \) \
  -mtime "+${LOCAL_RETENTION_DAYS}" -delete

echo "Encrypted offsite backup completed: ${snapshot_name}"
