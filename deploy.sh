#!/bin/bash
set -e

echo "=== Multicross Deploy ==="

echo "--- Pulling latest code ---"
git pull origin main

echo "--- Installing dependencies ---"
npm install --production=false

echo "--- Building ---"
npm run build

echo "--- Running migrations ---"
npm run migrate

echo "--- Restarting server ---"
pm2 restart multicross || pm2 start ecosystem.config.js --env production

echo "--- Deploy complete ---"
pm2 status
