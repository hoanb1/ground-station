#!/bin/bash
set -e

# Ground Station Deployment Script
# Single Source of Truth: /home/hoan/DATA/server6.15/ground-station
# Target Server: hoan@192.168.6.15 (/home/hoan/ground-station-native)

SERVER_IP="192.168.6.15"
SERVER_USER="hoan"
TARGET_DIR="/home/hoan/ground-station-native"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🚀 [1/3] Building Frontend..."
cd "$SCRIPT_DIR/frontend"
npm run build

echo "📦 [2/3] Syncing workspace code to server ($SERVER_IP:$TARGET_DIR)..."
rsync -rzv --no-owner --no-group --omit-dir-times \
    --exclude="node_modules" \
    --exclude=".venv" \
    --exclude="__pycache__" \
    --exclude=".pytest_cache" \
    --exclude="*.pyc" \
    --exclude=".git" \
    --exclude="backend/data/db/gs.db" \
    --exclude="backend/data/recordings/*" \
    --exclude="backend/data/snapshots/*" \
    --exclude="backend/data/audio/*" \
    --exclude="backend/data/uhd_images" \
    "$SCRIPT_DIR/" "$SERVER_USER@$SERVER_IP:$TARGET_DIR/"

echo "🔄 [3/3] Restarting ground-station service on server..."
ssh "$SERVER_USER@$SERVER_IP" "sudo systemctl restart ground-station.service"

echo "✅ Deployment complete! Service restarted successfully."
