---
date: 2026-02-23
model: gpt-5.2
description: "Phase 3: deploy Loki + Grafana via Docker Compose with 14-day retention and Grafana Loki datasource provisioning."
---

# Phase 3: Deploy Loki + Grafana (Docker Compose)

## Goal
Deploy a single-host Loki (monolithic mode) and Grafana using Docker Compose with:
- host-mounted persistence
- Loki 14-day retention (`336h`)
- Grafana Loki datasource provisioned
- Grafana reachable only on localhost (to be exposed later via Cloudflare Tunnel)

## Host directories
On the VPS (as root):

- Loki data: `/var/lib/loki`
- Grafana data: `/var/lib/grafana`
- Secrets/config: `/etc/loki-stack/` (root-only)

Create directories:
- `install -d -m 700 -o root -g root /etc/loki-stack`
- `install -d -m 755 -o root -g root /var/lib/loki`
- `install -d -m 755 -o root -g root /var/lib/grafana`

## Grafana env file (do not commit)
Create `/etc/loki-stack/grafana.env` on the VPS:

- `GF_SECURITY_ADMIN_USER=admin`
- `GF_SECURITY_ADMIN_PASSWORD=<strong password>`

## Deploy
1. Copy the repo stack directory to the VPS (path is your choice, example uses `/opt/loki-stack/`).
2. Run:
   - `docker compose -f compose.yml up -d`

The compose file binds ports to localhost only:
- Grafana: `127.0.0.1:3000`
- Loki: `127.0.0.1:3100`

## Verify
1. On the VPS:
   - `curl -sS http://127.0.0.1:3100/ready`
2. Open Grafana locally on the VPS:
   - `curl -sS -I http://127.0.0.1:3000/login`
3. In Grafana Explore, confirm the `Loki` datasource exists and queries return results once Phase 4 ingestion is deployed.

