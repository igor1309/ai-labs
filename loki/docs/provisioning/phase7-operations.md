---
date: 2026-02-23
model: gpt-5.2
description: "Phase 7: operations runbook for backups, upgrade+rollback, capacity review, and Telegram alerting verification."
---

# Phase 7: Operations (backups, upgrades, and capacity)

## Goal
Operationalize the Loki stack with repeatable backup/restore, upgrade+rollback workflow, capacity checks, and Grafana alerting to Telegram.

## Backup strategy
Use periodic filesystem archives for Loki and Grafana data:
- source paths:
  - `/var/lib/loki`
  - `/var/lib/grafana`
- destination:
  - `/var/backups/loki-stack`

Backup command:
- `bash loki/scripts/phase7/backup-loki-stack.sh`

Expected output:
- `/var/backups/loki-stack/loki-stack-<YYYYMMDDTHHMMSSZ>.tar.gz`

## Restore drill
Dry-run validation (archive integrity):
- `bash loki/scripts/phase7/restore-loki-stack.sh --dry-run --archive /var/backups/loki-stack/<archive>.tar.gz`

Actual restore:
- stop stack (`docker compose down`)
- `bash loki/scripts/phase7/restore-loki-stack.sh --archive /var/backups/loki-stack/<archive>.tar.gz`
- start stack (`docker compose up -d`)

## Upgrade and rollback procedure
1. Create a backup archive before upgrade.
2. Record running image tags:
   - `docker compose -f compose.yml images`
3. Pull and roll forward:
   - `docker compose -f compose.yml pull`
   - `docker compose -f compose.yml up -d`
4. Post-upgrade health checks:
   - `curl -sS http://127.0.0.1:3100/ready`
   - `curl -sS -I http://127.0.0.1:3000/login`
5. Rollback if checks fail:
   - pin previous image tags in `compose.yml`
   - `docker compose -f compose.yml up -d`
   - if needed, restore data from latest backup archive

## Capacity checklist
Review weekly:
1. Disk trend:
   - `df -h /var/lib/loki /var/lib/grafana`
2. journald usage:
   - `journalctl --disk-usage`
3. Ingestion continuity:
   - query recent logs for active projects/services in Grafana Explore
4. Retention window:
   - verify oldest queryable data is within expected 14-day horizon

## Grafana alerting to Telegram
Configure Grafana alerting with contact point name `loki-stack-telegram` and rules:
- `Host disk usage high`
- `Loki stack service health degraded`
- `No logs received`

Recommendation:
- route all three rules via notification policy receiver `loki-stack-telegram`
- use Grafana UI/API to acknowledge/silence alerts without host SSH access

## Verify Phase 7 on the VPS
Copy and run verifier:

1. Copy:
   - `scp loki/scripts/phase7/verify-host.sh root@<host>:/root/verify-loki-phase7.sh`
   - `scp loki/scripts/phase7/restore-loki-stack.sh root@<host>:/usr/local/bin/restore-loki-stack.sh`
   - `chmod +x /usr/local/bin/restore-loki-stack.sh`
2. Run:
   - `PHASE7_GRAFANA_URL=http://127.0.0.1:3000 PHASE7_GRAFANA_API_TOKEN=<grafana-admin-token> PHASE7_BACKUP_DIR=/var/backups/loki-stack PHASE7_RESTORE_SCRIPT_PATH=/usr/local/bin/restore-loki-stack.sh bash /root/verify-loki-phase7.sh`
