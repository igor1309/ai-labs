---
date: 2026-02-23
model: gpt-5.2
description: "Phase 1: provisioning and hardening checklist for the Loki logging stack host."
---

# Phase 1: VPS provisioning and hardening (Loki stack host)

## Goal
Provision and harden the single VPS host so later phases (Docker Loki+Grafana and host Alloy) have a safe baseline:
- key-only SSH access
- non-root admin user
- firewall allows inbound SSH only
- `DEPLOY_ENV ∈ {dev, stage, prod}` is available to systemd services
- Loki persistence uses a dedicated mounted data volume

## Generate cloud-init (recommended for new hosts)
This repo includes a Phase 1 cloud-init generator.

It configures:
- a non-root admin user with SSH key auth
- `DEPLOY_ENV` for systemd via `DefaultEnvironment=...`
- UFW with inbound SSH only
- SSH hardening (`PasswordAuthentication no`, `PermitRootLogin no`)

1. From the repo root, generate a cloud-init file:
   - `node loki/scripts/phase1/generate-cloud-init-cli.js --admin-user <user> --deploy-env <dev|stage|prod> --ssh-authorized-key "<ssh-public-key>"`
2. Paste the output into your provider’s cloud-init / user-data UI for the VPS, then provision the host.

## Configure Loki data volume mount
Pick a mountpoint for Loki persistence:
- Recommended: `/var/lib/loki`

On the VPS (as root):
1. Create the mountpoint directory.
2. Attach/format your data volume (provider-specific).
3. Add an `/etc/fstab` entry for the mount and reboot to verify it auto-mounts.

## Verify Phase 1 on the VPS
Copy the verifier script to the VPS and run it as root:
1. Copy:
   - `scp loki/scripts/phase1/verify-host.sh root@<host>:/root/verify-loki-phase1.sh`
2. Run:
   - `LOKI_DATA_MOUNTPOINT=/var/lib/loki bash /root/verify-loki-phase1.sh`

The script exits `0` on success and prints human-readable failures to stderr on mismatch.
