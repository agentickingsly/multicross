#!/bin/bash
set -e
export PATH="/root/.nvm/versions/node/v20.20.2/bin:$PATH"

cd /var/www/multicross

echo "=== Multicross Deploy ==="
echo "--- Pulling latest code ---"
git checkout -- .
git pull origin main
echo "--- Installing dependencies ---"
npm install --production=false
echo "--- Building shared ---"
npm run build --workspace=shared
echo "--- Building server ---"
npm run build --workspace=server
echo "--- Building client ---"
npm run build --workspace=client
echo "--- Running migrations ---"
npm run migrate --workspace=server
echo "--- Restarting server ---"
pm2 restart multicross || pm2 start ecosystem.config.js --env production
echo "--- Deploy complete ---"
pm2 status
