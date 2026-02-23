---
date: 2026-02-23
model: gpt-5.2
description: "Phase 2: configure journald persistence and Docker journald logging on the Loki stack host."
---

# Phase 2: Host runtime prerequisites (journald + Docker)

## Goal
Prepare the host runtime so later phases can ingest logs reliably via journald:
- journald is persistent and bounded
- Docker uses the journald logging driver
- a standard root-only config directory exists at `/etc/loki-stack/`

## journald: enable persistence and caps
On the VPS (as root):

1. Ensure persistent journals are enabled:
   - `mkdir -p /var/log/journal`
   - `systemctl restart systemd-journald`
2. Install a journald drop-in:
   - Copy `loki/host/journald/loki-stack.conf` to `/etc/systemd/journald.conf.d/loki-stack.conf`
   - `systemctl restart systemd-journald`

## Docker: set logging driver to journald
On the VPS (as root):

1. Install Docker (provider/OS-specific).
2. Configure the daemon:
   - If `/etc/docker/daemon.json` does not exist, copy `loki/host/docker/daemon.json` to `/etc/docker/daemon.json`.
   - If it exists, merge in `"log-driver": "journald"` without removing existing settings.
3. Restart Docker:
   - `systemctl restart docker`

## Stack config directory
On the VPS (as root):
- `install -d -m 700 -o root -g root /etc/loki-stack`

## Verify Phase 2 on the VPS
Copy the verifier script to the VPS and run it as root:

1. Copy:
   - `scp loki/scripts/phase2/verify-host.sh root@<host>:/root/verify-loki-phase2.sh`
2. Run:
   - `bash /root/verify-loki-phase2.sh`

Manual sanity checks:
- Confirm journald usage:
  - `journalctl --disk-usage`
- Confirm Docker logs land in journald:
  - `docker run --rm --name loki-phase2-smoke alpine sh -c 'echo loki-phase2-smoke'`
  - `journalctl CONTAINER_NAME=loki-phase2-smoke -n 50`

