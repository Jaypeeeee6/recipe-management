#!/usr/bin/env bash
# Deploy Recipe Management to the server (same style as QC-Monitor rsync).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
REMOTE="${REMOTE:-developer@161.97.168.133:~/apps/RecipeManagement/}"

cd "$ROOT"

echo "Building frontend…"
(cd frontend && npm run build)

echo "Syncing to ${REMOTE}"
rsync -avR \
  --exclude '.git/' \
  --exclude 'venv/' \
  --exclude 'frontend/node_modules/' \
  --exclude '__pycache__/' \
  --exclude '*.pyc' \
  --exclude '.env' \
  --exclude 'db.sqlite3' \
  --exclude 'media/*' \
  manage.py \
  requirements.txt \
  README.md \
  .env.example \
  .gitignore \
  config \
  lab \
  static \
  frontend/dist \
  frontend/package.json \
  frontend/package-lock.json \
  frontend/vite.config.js \
  frontend/index.html \
  frontend/public \
  frontend/src \
  "$REMOTE"

echo
echo "Done. On the server, finish setup (see README / chat instructions)."
echo "App port: 8092"
