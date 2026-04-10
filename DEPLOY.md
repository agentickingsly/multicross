# VPS Deployment Guide

## Recommended specs

| | Minimum | Recommended |
|---|---|---|
| RAM | 1 GB | 2 GB |
| CPU | 1 vCPU | 2 vCPU |
| Disk | 20 GB | 40 GB |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |

## First-time server setup

### 1. System packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl build-essential
```

### 2. Node.js via nvm

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
nvm alias default 20
```

### 3. PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib

# Start and enable on boot
sudo systemctl enable --now postgresql

# Create database and user
sudo -u postgres psql <<SQL
CREATE USER crossword WITH PASSWORD 'your-strong-password';
CREATE DATABASE crossword OWNER crossword;
SQL
```

### 4. Redis

```bash
sudo apt install -y redis-server

# Bind to localhost only (default) — verify in /etc/redis/redis.conf:
#   bind 127.0.0.1

sudo systemctl enable --now redis-server
```

### 5. Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

### 6. PM2

```bash
npm install -g pm2
pm2 startup   # follow the printed command to enable PM2 on boot
```

### 7. Clone and configure the app

```bash
sudo mkdir -p /var/www/multicross
sudo chown $USER:$USER /var/www/multicross

git clone <your-repo-url> /var/www/multicross
cd /var/www/multicross

# Server environment
cp server/.env.example server/.env
nano server/.env
# Set at minimum:
#   DATABASE_URL=postgresql://crossword:your-strong-password@localhost:5432/crossword
#   REDIS_URL=redis://localhost:6379
#   JWT_SECRET=<output of: openssl rand -base64 48>
#   NODE_ENV=production
#   ALLOWED_ORIGINS=https://your-domain.com

# Client environment
cp client/.env.example client/.env
nano client/.env
# Set:
#   VITE_API_URL=https://your-domain.com
```

### 8. Generate a strong JWT secret

```bash
openssl rand -base64 48
# Paste the output as JWT_SECRET in server/.env
```

### 9. Build and migrate

```bash
npm install
npm run build
npm run migrate
npm run seed      # only needed once for initial puzzle data
```

### 10. Configure Caddy

```bash
# Edit the Caddyfile — replace "your-domain.com" with your actual domain
sudo cp /var/www/multicross/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile

sudo systemctl reload caddy
```

Caddy automatically provisions a TLS certificate from Let's Encrypt the first time it handles a request to your domain. Ensure port 80 and 443 are open in your firewall.

### 11. Start the server

```bash
cd /var/www/multicross
pm2 start ecosystem.config.js --env production
pm2 save   # persist the process list across reboots
```

---

## Subsequent deployments

```bash
cd /var/www/multicross
./deploy.sh
```

`deploy.sh` pulls the latest code, reinstalls dependencies, rebuilds, runs any new migrations, and restarts the PM2 process.

---

## Viewing logs

```bash
# Live tail (server stdout + stderr combined)
pm2 logs multicross

# Last 200 lines
pm2 logs multicross --lines 200

# Log files on disk
tail -f /var/www/multicross/logs/out.log
tail -f /var/www/multicross/logs/err.log

# Caddy access logs
sudo journalctl -u caddy -f
```

---

## PM2 process management

```bash
pm2 status                         # show all processes
pm2 restart multicross             # restart
pm2 stop multicross                # stop
pm2 delete multicross              # remove from PM2
pm2 start ecosystem.config.js --env production  # start fresh
```

---

## SSL / TLS

Caddy handles TLS automatically. No manual certificate steps are required as long as:

1. Your domain's DNS A record points to this server's IP.
2. Ports 80 and 443 are open in the firewall (`sudo ufw allow 80 && sudo ufw allow 443`).
3. The domain in `/etc/caddy/Caddyfile` matches exactly.

Caddy renews certificates automatically before they expire.

---

## Systemd alternative (instead of PM2)

If you prefer systemd over PM2:

```bash
# Copy the unit file
sudo cp /var/www/multicross/multicross.service /etc/systemd/system/

# Edit WorkingDirectory and ExecStart paths if your deploy path differs,
# and add EnvironmentFile if you want systemd to load server/.env:
#   EnvironmentFile=/var/www/multicross/server/.env

sudo systemctl daemon-reload
sudo systemctl enable --now multicross

# View logs
sudo journalctl -u multicross -f
```

---

## Firewall quickstart

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

Do **not** expose port 3001 publicly — Caddy proxies all external traffic.
