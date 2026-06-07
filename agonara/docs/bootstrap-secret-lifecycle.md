---
date: 2026-06-07
model: gpt-5
description: "Operational lifecycle for Agonara bootstrap secrets on agonara-vps."
---

# Bootstrap Secret Lifecycle

## Scope

This note closes the bootstrap-secret lifecycle question from
[`deployment-handoff.md`](deployment-handoff.md). It applies to
`AGONARA_BOOTSTRAP_SECRET` for Agonara staging and production on agonara-vps.

Governed by
[ADR-017](adr/adr-017-private-instance-deployment-operational-boundary.md);
this note only decides generation, storage, rotation, and verification.

## Decision

Staging and production use distinct `AGONARA_BOOTSTRAP_SECRET` values.

Each secret is generated as a high-entropy random value and stored in exactly two
places:

- the tier's host-side runtime env file on agonara-vps, with restrictive file
  permissions;
- the operator's external secret store.

The secret is never committed, passed as a command-line argument, logged, placed
in an image layer, copied into backup archives, or reused across tiers.

## Generation

Generate a new bootstrap secret when provisioning a tier, rebuilding a tier from
scratch, or rotating after suspected exposure.

The generated value must be long enough to resist guessing and must come from an
operating-system cryptographic random source. Record the value only in the
external secret store and the tier env file.

## Rotation

Rotate the bootstrap secret in these cases:

- after the first Admin has been bootstrapped for a newly provisioned tier;
- after any suspected exposure of the tier env file, operator workstation,
  terminal scrollback, or external secret-store item;
- after a restore or rebuild drill that creates a bootstrap-eligible tier state;
- when rotating the broader host-side secret set for the tier.

Rotation means replacing the value in the external secret store and the tier env
file, restarting or redeploying the tier so the new runtime env is loaded, and
verifying that first-Admin bootstrap remains unavailable when an effective Admin
already exists.

## Verification

After rotation, verify:

- the tier health endpoint returns `status: ok` and the expected version;
- first-Admin bootstrap status is unavailable after an Admin exists;
- no logs, diagnostics, API responses, backup archives, or release-smoke output
  expose the old or new bootstrap secret;
- staging and production env files contain different bootstrap-secret values.

The verification result belongs in the relevant operational log, not in this
repository.

## Ownership

The private-instance Agonara admin owns bootstrap-secret generation, storage,
rotation, and verification. Application code owns rejecting invalid or repeated
bootstrap attempts and redacting bootstrap secrets from outputs.
