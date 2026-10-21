#!/usr/bin/env bash
# Starts a throwaway API for the Playwright suite: Postgres (Docker, unless E2E_DATABASE_URL is set) + local storage.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${E2E_API_PORT:-4100}"
DB_URL="${E2E_DATABASE_URL:-}"
CONTAINER=""
API_PID=""
cleanup() {
  [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null || true
  [ -n "$CONTAINER" ] && docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$STORE"
}
STORE="$(mktemp -d)"
trap cleanup EXIT INT TERM

if [ -z "$DB_URL" ]; then
  CONTAINER="coursebox-e2e-db-$$"
  docker run -d --rm --name "$CONTAINER" -e POSTGRES_PASSWORD=e2e -p 127.0.0.1::5432 postgres:17-alpine >/dev/null
  DB_PORT="$(docker port "$CONTAINER" 5432/tcp | head -1 | awk -F: '{print $NF}')"
  for _ in $(seq 1 60); do docker exec "$CONTAINER" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && break; sleep 0.5; done
  DB_URL="postgres://postgres:e2e@127.0.0.1:${DB_PORT}/postgres"
fi

export NODE_ENV=test PORT DATABASE_URL="$DB_URL" DATABASE_SSL=false DATABASE_SCHEMA=coursebox RUN_MIGRATIONS=true \
  STORAGE_DRIVER=local LOCAL_STORAGE_DIR="$STORE" PUBLIC_API_URL="http://localhost:${PORT}" \
  SIGNING_SECRET=e2e-signing-secret-0123456789 CORS_ORIGINS="${E2E_WEB_ORIGIN:-http://localhost:3210}" COURSE_LIMIT=2 \
  MAX_COURSE_BYTES=209715200 MAIL_DRIVER=log MAIL_LOG_FILE="${E2E_MAIL_LOG:-$STORE/mail.log}"
# not exec: the trap must run to remove the database container
node_modules/.bin/tsx src/index.ts &
API_PID=$!
wait "$API_PID"
