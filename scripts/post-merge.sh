#!/bin/bash
set -e

# Post-merge setup for BlueAlly Insight.
# Runs after a project task is merged into main.
# Must be idempotent and non-interactive.

echo "[post-merge] Installing npm dependencies..."
npm install --no-audit --no-fund --prefer-offline

echo "[post-merge] Pushing Drizzle schema to the database..."
npm run db:push -- --force

echo "[post-merge] Done."
