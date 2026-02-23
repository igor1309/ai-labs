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

### Temporary fallback when a dedicated volume is not attached yet
If you need to pass Phase 1 verification before the provider volume is attached, use a temporary loopback filesystem:
1. `fallocate -l 8G /var/lib/loki-data.img`
2. `mkfs.ext4 -F /var/lib/loki-data.img`
3. `mkdir -p /var/lib/loki`
4. Add to `/etc/fstab`: `/var/lib/loki-data.img /var/lib/loki ext4 loop,defaults,nofail 0 2`
5. `mount /var/lib/loki`

Replace this with a real dedicated data volume before production retention growth.

## Phase 1 status when using temporary loopback storage
- If all verifier checks pass with the temporary loopback mount, treat Phase 1 as **provisionally passed**.
- Final Phase 1 completion requires replacing loopback storage with a dedicated attached block volume mounted at `/var/lib/loki`.
- Keep this status explicit in operational notes/logs until dedicated-volume cutover is complete.

### Current blocker example (real host status)
- Host: `95.164.53.144`
- Requested provider action: attach a separate raw/unformatted `20G` block volume.
- Current blocker: provider expanded the primary/root disk instead of attaching a separate volume.
- Phase 1 remains **provisionally passed** until separate-volume attachment succeeds and loopback cutover is completed.

## Manual hardening path for existing hosts
If the host was already created without cloud-init:
1. Create a non-root admin user (for example `loki`) with SSH public key auth.
2. Grant sudo access to that user.
3. Validate SSH login as the non-root user before disabling root SSH.
4. Set `DEPLOY_ENV` in `/etc/systemd/system.conf.d/10-deploy-env.conf`.
5. Configure UFW to allow inbound OpenSSH only, deny other inbound traffic, and enable UFW.
6. Disable SSH password auth and root login, reload SSH, then re-check with `sshd -T`.

If `sshd -T` still reports `passwordauthentication yes` after config updates, add a final override block at the end of `/etc/ssh/sshd_config`:
- `Match all`
- `PasswordAuthentication no`
- `PermitRootLogin no`

## Verify Phase 1 on the VPS
Copy the verifier script to the VPS and run it as root:
1. Copy:
   - `scp loki/scripts/phase1/verify-host.sh root@<host>:/root/verify-loki-phase1.sh`
2. Run:
   - `LOKI_DATA_MOUNTPOINT=/var/lib/loki bash /root/verify-loki-phase1.sh`

The script exits `0` on success and prints human-readable failures to stderr on mismatch.
