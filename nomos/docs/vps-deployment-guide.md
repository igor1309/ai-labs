# Nomos — VPS Deployment Guide

Step-by-step instructions for deploying Nomos on a fresh VPS.

**Stack**: Docker Compose + Caddy (automatic TLS) + SQLite (WAL)
**Architecture**: Client → Caddy (HTTPS) → Nomos (port 8080) → LLM Vendor API

---

## Current Deployment

Concrete values for the active deployment. The rest of the guide uses `YOUR_DOMAIN` / `VPS_IP` placeholders — substitute these values when following each step.

| Parameter | Value |
|---|---|
| **Domain** | `nomos.enoa.ai` |
| **VPS IP** | `95.164.53.144` |
| **DNS provider** | Cloudflare (manages `enoa.ai`) |
| **LLM vendor** | OpenRouter |
| **Vendor base URL** | `https://openrouter.ai/api/v1` |
| **Deploy path** | `/opt/nomos` |

---

## Prerequisites

| Requirement | Notes |
|---|---|
| VPS with Linux (Ubuntu 22.04+ or Debian 12+ recommended) | 1 vCPU / 1 GB RAM is sufficient for low traffic |
| SSH access with a sudo-capable user | All commands below assume you SSH in as this user |
| A domain name pointing to the VPS | A-record: `YOUR_DOMAIN → VPS_IP` |
| An LLM vendor API key | OpenRouter, OpenAI, or any OpenAI-compatible provider |
| DNS managed via Cloudflare (or other provider) | See §1 for Cloudflare-specific setup |

---

## 1. Cloudflare DNS Setup

Caddy needs to reach the VPS directly to obtain TLS certificates via Let's Encrypt (HTTP-01 challenge). Cloudflare's proxy (orange cloud) intercepts this. Use **DNS-only mode** for the Nomos subdomain.

### 1.1 Create the DNS record

In the Cloudflare dashboard for `enoa.ai`:

1. Go to **DNS → Records → Add Record**
2. Set:
   - **Type**: `A`
   - **Name**: `nomos` (creates `nomos.enoa.ai`)
   - **IPv4 address**: `VPS_IP` (e.g., `95.164.53.144`)
   - **Proxy status**: **DNS only** (grey cloud)
   - **TTL**: Auto
3. Save

> **Why grey cloud?** Caddy handles TLS directly via Let's Encrypt. If Cloudflare proxy is enabled (orange cloud), the ACME HTTP-01 challenge fails because Cloudflare intercepts the verification request before it reaches Caddy. DNS-only mode lets traffic go straight to the VPS where Caddy can prove domain ownership and terminate TLS itself.

### 1.2 Verify DNS propagation

```bash
# From your local machine or the VPS
dig +short nomos.enoa.ai
# Should return: 95.164.53.144 (your VPS_IP)
```

Wait for propagation before proceeding (usually instant with Cloudflare, up to a few minutes).

---

## 2. Install Docker

```bash
# Install Docker Engine + Compose plugin (official method)
curl -fsSL https://get.docker.com | sh

# Allow your user to run Docker without sudo
sudo usermod -aG docker $USER

# Log out and back in, then verify
docker compose version
```

---

## 3. Open Firewall Ports

```bash
# UFW (Ubuntu/Debian)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
sudo ufw enable

# Or iptables equivalent — ensure TCP 80, 443, and 22 are open
```

Also verify your VPS provider's security group / firewall panel allows inbound 80 and 443.

---

## 4. Create Deployment Directory

```bash
sudo mkdir -p /opt/nomos/{data,backups,bin}
sudo chown -R $USER:$USER /opt/nomos
cd /opt/nomos
```

Final layout:

```
/opt/nomos/
├── docker-compose.yml
├── Caddyfile
├── .env
├── data/
│   └── nomos.db        (created automatically on first start)
├── backups/
└── bin/
    └── backup.sh       (nightly backup script)
```

---

## 5. Create Configuration Files

### 5.1 docker-compose.yml

```yaml
services:
  nomos:
    image: nomos:latest        # Replace with your registry image or use build: .
    container_name: nomos
    restart: unless-stopped
    env_file: .env
    volumes:
      - ./data:/app/data
    expose:
      - "8080"
    labels:
      com.logging.project: nomos
      com.logging.service: api

  caddy:
    image: caddy:2-alpine
    container_name: nomos-caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    depends_on:
      - nomos
    labels:
      com.logging.project: nomos
      com.logging.service: caddy

volumes:
  caddy-data:
  caddy-config:
```

> **Building from source instead of a registry image?** Clone the repo onto the VPS, copy the `nomos/` directory, and replace `image: nomos:latest` with `build: .` (the Dockerfile is already in the project root).

### 5.2 Caddyfile

Replace `YOUR_DOMAIN` with your actual domain (e.g., `nomos.enoa.ai`). Caddy will automatically obtain and renew TLS certificates from Let's Encrypt.

```
YOUR_DOMAIN {
	reverse_proxy nomos:8080 {
		flush_interval -1
	}
}
```

`flush_interval -1` is **critical** — it disables response buffering so SSE streaming works correctly.

### 5.3 .env

```bash
# Server
NOMOS_PORT=8080
NOMOS_HOST=0.0.0.0
NOMOS_DB_PATH=data/nomos.db
NODE_ENV=production

# Vendor — OpenRouter (default for this deployment)
NOMOS_VENDOR_BASE_URL=https://openrouter.ai/api/v1
NOMOS_VENDOR_TIMEOUT_MS=30000
NOMOS_VENDOR_API_KEY=sk-or-v1-your-openrouter-key-here

# Stub API (must be disabled in production)
NOMOS_STUB_ENABLED=false

# Safeguards (prompt injection detection & sanitization)
NOMOS_SAFEGUARDS_ENABLED=true
NOMOS_SAFEGUARDS_SANITIZE=true
NOMOS_SAFEGUARDS_REINFORCE=false
NOMOS_SAFEGUARDS_BLOCK=false
```

Lock down permissions on the env file:

```bash
chmod 600 /opt/nomos/.env
```

**Alternative vendor URLs** (swap `NOMOS_VENDOR_BASE_URL` and key as needed):

| Provider | NOMOS_VENDOR_BASE_URL |
|---|---|
| OpenRouter | `https://openrouter.ai/api/v1` |
| OpenAI | `https://api.openai.com/v1` |
| Any OpenAI-compatible | The provider's base URL ending in `/v1` |

---

## 6. Build or Pull the Image

### Option A: Build from source on the VPS

```bash
cd /opt/nomos

# Clone the repo (or scp the nomos/ directory)
git clone https://github.com/YOUR_ORG/ai-labs.git /tmp/ai-labs

# Copy project files needed for the build
cp /tmp/ai-labs/nomos/Dockerfile .
cp -r /tmp/ai-labs/nomos/src ./src
cp /tmp/ai-labs/nomos/package.json .
cp /tmp/ai-labs/nomos/package-lock.json .

# Build
docker compose build
```

### Option B: Use a pre-built image from a registry

If you push images to a container registry (GHCR, Docker Hub, etc.), update `docker-compose.yml` to reference the registry image:

```yaml
nomos:
  image: ghcr.io/your-org/nomos:0.6.0
```

Then pull:

```bash
docker compose pull
```

---

## 7. Start the Stack

```bash
cd /opt/nomos
docker compose up -d
```

Watch the logs to confirm startup:

```bash
docker logs -f nomos
```

You should see:

```json
{"level":"info","msg":"nomos started","port":8080,"host":"0.0.0.0","env":"production"}
```

Press `Ctrl+C` to stop tailing.

---

## 8. Register a Client Project

Nomos authenticates clients via bearer tokens. Each project gets a unique token stored as a SHA-256 hash in the database.

### 8.1 Generate a token

```bash
TOKEN=$(openssl rand -hex 32)
echo "Save this token securely: $TOKEN"
```

### 8.2 Insert the project into the database

```bash
TOKEN_HASH=$(echo -n "$TOKEN" | sha256sum | awk '{print $1}')

docker exec nomos node -e "
  import Database from 'better-sqlite3';
  const db = new Database('/app/data/nomos.db');
  db.prepare(
    'INSERT INTO projects (id, name, token_hash, scope, active) VALUES (?, ?, ?, ?, ?)'
  ).run('my-project', 'My Project', '$TOKEN_HASH', 'live', 1);
  db.close();
  console.log('Project registered.');
"
```

Parameters:
- **id**: unique project identifier (e.g., `oracle`, `my-app`)
- **name**: human-readable display name
- **token_hash**: SHA-256 hash of the bearer token
- **scope**: `live` (real vendor calls) or `stub` (test fixtures)
- **active**: `1` (enabled) or `0` (disabled)

### 8.3 (Optional) Set a budget

```bash
docker exec nomos node -e "
  import Database from 'better-sqlite3';
  const db = new Database('/app/data/nomos.db');
  db.prepare(
    'INSERT INTO budgets (project_id, limit_tokens, period, current_usage, period_start) VALUES (?, ?, ?, ?, datetime(\"now\"))'
  ).run('my-project', 1000000, 'monthly', 0);
  db.close();
  console.log('Budget set.');
"
```

---

## 9. Verify the Deployment

### 9.1 Health check

```bash
curl -fsS https://YOUR_DOMAIN/health
# Expected: {"status":"ok"}
```

### 9.2 Authenticated API call

```bash
curl -s https://YOUR_DOMAIN/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "model": "openrouter/auto",
    "messages": [{"role": "user", "content": "Say hello"}]
  }'
```

> Replace `openrouter/auto` with any model available on your vendor (e.g., `anthropic/claude-sonnet-4-20250514`, `openai/gpt-4o`).

### 9.3 Streaming test

```bash
curl -N https://YOUR_DOMAIN/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "model": "openrouter/auto",
    "messages": [{"role": "user", "content": "Say hello"}],
    "stream": true
  }'
```

You should see incremental `data: {...}` lines ending with `data: [DONE]`.

---

## 10. Set Up Automated Backups

Create `/opt/nomos/bin/backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT="/opt/nomos"
DATE="$(date +%F)"
BK="$ROOT/backups"

mkdir -p "$BK"

# SQLite-safe backup (does not corrupt WAL)
sqlite3 "$ROOT/data/nomos.db" ".backup '$BK/nomos-$DATE.db'"

# Config snapshots
cp "$ROOT/.env" "$BK/env-$DATE.bak"
cp "$ROOT/docker-compose.yml" "$BK/compose-$DATE.yml"
cp "$ROOT/Caddyfile" "$BK/Caddyfile-$DATE.bak"

# Prune backups older than 30 days
find "$BK" -type f -mtime +30 -delete
```

Install sqlite3 on the host and enable the cron job:

```bash
sudo apt-get install -y sqlite3
chmod +x /opt/nomos/bin/backup.sh

# Add to crontab (runs daily at 03:15)
(crontab -l 2>/dev/null; echo "15 3 * * * /opt/nomos/bin/backup.sh >/dev/null 2>&1") | crontab -
```

---

## 11. Configure Log Rotation

Docker's default `json-file` driver keeps logs indefinitely. Add limits in `/etc/docker/daemon.json`:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "5"
  }
}
```

Then restart Docker:

```bash
sudo systemctl restart docker
```

---

## 12. Updates & Rollbacks

### Deploy an update

```bash
cd /opt/nomos

# If building from source:
docker compose build --pull
docker compose up -d

# If using a registry image — update the tag in docker-compose.yml, then:
docker compose pull
docker compose up -d
```

### Post-deploy check

```bash
docker compose ps
docker logs --tail=50 nomos
curl -fsS https://YOUR_DOMAIN/health
```

### Rollback

1. Edit `docker-compose.yml` to the previous image tag
2. Recreate:

```bash
docker compose up -d
curl -fsS https://YOUR_DOMAIN/health
```

If the issue is database-related, restore from backup:

```bash
docker compose down
cp /opt/nomos/backups/nomos-YYYY-MM-DD.db /opt/nomos/data/nomos.db
docker compose up -d
```

---

## 13. Incident Triage

Quick diagnostic checklist:

```bash
# 1. Are containers running?
docker compose ps

# 2. Recent logs
docker logs --tail=300 nomos
docker logs --tail=100 nomos-caddy

# 3. Health endpoint (verbose)
curl -v https://YOUR_DOMAIN/health

# 4. Can Nomos reach the vendor from inside the container?
docker exec nomos wget -qO- https://openrouter.ai/api/v1/models 2>&1 | head -5

# 5. Disk space (SQLite needs room to write)
df -h /opt/nomos/data
```

---

## Quick Reference

| Action | Command |
|---|---|
| Start | `cd /opt/nomos && docker compose up -d` |
| Stop | `cd /opt/nomos && docker compose down` |
| Logs (nomos) | `docker logs -f nomos` |
| Logs (caddy) | `docker logs -f nomos-caddy` |
| Health check | `curl -fsS https://YOUR_DOMAIN/health` |
| Update | `docker compose pull && docker compose up -d` |
| Backup now | `/opt/nomos/bin/backup.sh` |
| Container status | `docker compose ps` |
