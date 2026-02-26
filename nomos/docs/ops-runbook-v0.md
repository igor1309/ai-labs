---
date: 2026-02-26
model: gpt-5.2
source: https://chatgpt.com/share/69a04dee-78a4-8003-8d39-553a25372c4f
---

# Nomos — Operations Runbook (V0)

Date: 2026-02-26  
Scope: Solo VPS deployment  
Stack: Docker Compose + Caddy + SQLite (WAL) + SSE streaming

---

## 0. Assumptions

- You deploy under `/opt/nomos`
- Caddy terminates TLS and reverse-proxies to `nomos` container
- Nomos persists governance state in `data/nomos.db`
- Logs are JSON to stdout; rotation is handled on the host (Docker logging driver or logrotate)

---

## 1. Directory Layout

Recommended layout:

```
/opt/nomos/
  ├── docker-compose.yml
  ├── .env
  ├── Caddyfile
  ├── data/
  │    └── nomos.db
  └── backups/
```

Permissions (recommended baseline):

- `/opt/nomos/.env` should be readable only by root (or the deploy user)
- `/opt/nomos/data` should not be world-readable

---

## 2. Compose Baseline (Operational Requirements)

Your `docker-compose.yml` MUST ensure:

- `restart: unless-stopped`
- a persistent volume/bind mount for `data/`
- predictable container names (for operator commands)

Example (illustrative only — keep your real file as source of truth):

- `nomos` service exposes internal port (e.g. `8080`)
- `caddy` service exposes `80:80` and `443:443`

---

## 3. Caddy Requirements (SSE Streaming)

Caddy must not buffer or break streaming. Baseline requirement:

- Reverse proxy should pass through streaming responses as-is
- Avoid proxy buffering features that delay flushes

Minimal shape:

- `reverse_proxy nomos:8080`

(If you later place Nomos behind additional proxies/CDNs, re-validate SSE end-to-end.)

---

## 4. Install / First Bring-up

### 4.1 Prereqs

- Docker Engine installed
- Docker Compose plugin installed
- Firewall allows TCP 80/443 inbound
- DNS A/AAAA records point to the VPS

### 4.2 Bring-up

```bash
cd /opt/nomos
docker compose pull
docker compose up -d
```

### 4.3 Verify

```bash
docker compose ps
docker logs --tail=200 nomos
```

Health check (adjust path to your real endpoint):

```bash
curl -fsS https://YOUR_DOMAIN/health
```

Streaming smoke test (adjust path/params to your real endpoint):

```bash
curl -N https://YOUR_DOMAIN/v1/chat/stream
```

`-N` disables curl buffering so you can observe incremental chunks.

---

## 5. Deploy / Release Train

### 5.1 Standard Update

```bash
cd /opt/nomos
docker compose pull
docker compose up -d
```

### 5.2 Post-deploy Checks

```bash
docker compose ps
docker logs --tail=200 nomos
curl -fsS https://YOUR_DOMAIN/health
```

---

## 6. Rollback

Rollbacks assume you pin images by tag (recommended).

1) Edit `docker-compose.yml` to the previous known-good image tag  
2) Recreate containers:

```bash
cd /opt/nomos
docker compose up -d
```

Verify:

```bash
curl -fsS https://YOUR_DOMAIN/health
```

If the issue is persistent state related, restore DB from backup (see §8).

---

## 7. SQLite Operational Notes (WAL)

Nomos uses SQLite with WAL.

Operational rules:

- Keep the DB on a persistent filesystem (not tmpfs)
- Backups should be taken in a SQLite-safe way (see §8.2)

---

## 8. Backups

### 8.1 What to Backup

Minimum backup set:

- `data/nomos.db` (and any adjacent SQLite files if present)
- `.env` (or equivalent config)
- `docker-compose.yml`
- `Caddyfile`

### 8.2 SQLite-safe Backup (Preferred)

If `sqlite3` is available on the host:

```bash
sqlite3 /opt/nomos/data/nomos.db ".backup '/opt/nomos/backups/nomos-$(date +%F).db'"
```

Then snapshot config:

```bash
cp /opt/nomos/.env /opt/nomos/backups/env-$(date +%F).bak
cp /opt/nomos/docker-compose.yml /opt/nomos/backups/compose-$(date +%F).yml
cp /opt/nomos/Caddyfile /opt/nomos/backups/Caddyfile-$(date +%F).bak
```

### 8.3 Automated Nightly Backup (cron)

Create `/opt/nomos/bin/backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT="/opt/nomos"
DATE="$(date +%F)"
BK="$ROOT/backups"

mkdir -p "$BK"

sqlite3 "$ROOT/data/nomos.db" ".backup '$BK/nomos-$DATE.db'"

cp "$ROOT/.env" "$BK/env-$DATE.bak"
cp "$ROOT/docker-compose.yml" "$BK/compose-$DATE.yml"
cp "$ROOT/Caddyfile" "$BK/Caddyfile-$DATE.bak"
```

Make executable:

```bash
chmod +x /opt/nomos/bin/backup.sh
```

Crontab example (03:15 daily):

```cron
15 3 * * * /opt/nomos/bin/backup.sh >/dev/null 2>&1
```

Retention is your choice; simplest is a separate cleanup script (later).

---

## 9. Restore

### 9.1 Stop Services

```bash
cd /opt/nomos
docker compose down
```

### 9.2 Replace DB

```bash
cp /opt/nomos/backups/nomos-YYYY-MM-DD.db /opt/nomos/data/nomos.db
```

### 9.3 Start Services

```bash
docker compose up -d
curl -fsS https://YOUR_DOMAIN/health
```

---

## 10. Token Rotation (Per Project)

Baseline process:

1. Generate a new token (random, high-entropy)
2. Add new token to Nomos (keep old token temporarily valid)
3. Deploy client config change (switch to new token)
4. Revoke old token in Nomos
5. Verify access with the new token only

Operational requirement:

- Never log raw bearer tokens
- Store only hashed/partial representation in logs

---

## 11. Logs & Rotation (Host-level)

Pick ONE approach and standardize it:

- Docker `json-file` driver + logrotate
- Docker `local` logging driver with size limits
- External shipper later

Minimum requirement:

- enforce max size
- enforce retention window

---

## 12. Incident Checklist (Fast Triage)

1. Confirm containers are running:
   ```bash
   docker compose ps
   ```
2. Check recent logs:
   ```bash
   docker logs --tail=300 nomos
   docker logs --tail=300 caddy
   ```
3. Health endpoint:
   ```bash
   curl -v https://YOUR_DOMAIN/health
   ```
4. Vendor reachability from VPS (basic):
   ```bash
   docker exec -it nomos sh -lc "wget -qO- https://api.openai.com >/dev/null || true"
   ```
   (Adjust per provider / tooling.)
5. If DB corruption suspected: restore from latest backup.