---
title: Initial Bring-Up Steps — Real Integration Path
date: 2026-04-18
model: gpt-5.4
description: "Defines the ordered bring-up steps for the real Notio integration path and locks the Step 3 service slice."
version: 0.0.4
author: OpenAI GPT-5.4 Thinking
status: draft
type: note
---

# Initial Bring-Up Steps — Real Integration Path

## Goal

Bring up the real Telegram ingress path end to end through the real release and deployment path:

`Git tag -> CI -> artifact -> VPS -> inbox.enoa.ai -> Cloudflare -> Tunnel -> service -> Telegram webhook delivery`

## Steps

1. ✅ Select the VPS.
2. ✅ Set up `inbox.enoa.ai` in Cloudflare.
3. ✅ Implement the first real service slice.
4. ✅ Wire tag-driven CI/CD for the service.
5. ✅ Configure Cloudflare Tunnel from `inbox.enoa.ai` to the service on the VPS.
6. Tag a release.
7. Run CI:
   - tests
   - build artifact
   - deploy to VPS
   - verify running health
   - verify running version equals tag
8. Verify the service locally on the VPS.
9. Verify public reachability through `inbox.enoa.ai` via Cloudflare and Tunnel.
10. Set up the Telegram bot.
11. Configure the Telegram webhook to the secret webhook path on `inbox.enoa.ai`.
12. Verify end-to-end delivery from Telegram to the deployed service.

## First service slice

The first deployed slice should include:

- a Swift server app using Hummingbird
- webhook handler
- health endpoint
- version endpoint
- minimal structured logging

### Fixed constraints for Step 3

Step 3 is not a stack-selection step.

For this slice, the implementation stack is fixed:

- language: Swift
- server framework: Hummingbird
- runtime shape: one deployable service

The required routes are:

- `GET /health`
- `GET /version`
- `POST /<secret-webhook-path>`

The webhook path must acknowledge quickly.
The slice must produce a Docker artifact.
The slice must expose runtime version information so CI can verify that the running service version matches the triggering tag.

### Open implementation details for Step 3

These details remain open for implementation design:

- exact Swift package and module layout
- exact runtime configuration shape
- exact version injection mechanism
- exact logging library choice
- whether diagnostic modes are implemented in this slice or deferred to a later step

## CI/CD requirements for bring-up

The bring-up should use the real release path.

Minimum required pipeline behavior:

- run tests
- build deployable artifact on green
- deploy to the VPS
- verify the deployed service is running
- verify the deployed service reports the same version as the triggering tag

## Verification points

### CI/CD verification

Confirm the tagged version was built, deployed, and is the version reported by the running service on the VPS.

### Local verification on the VPS

Confirm the service is running and reachable on the machine.

### Public verification through Cloudflare and Tunnel

Confirm the public hostname reaches the deployed service correctly.

### Telegram end-to-end verification

Confirm Telegram webhook delivery reaches the deployed service over the intended ingress path.

## Note

The first bring-up should exercise the real deployment path, not a one-off manual deployment separate from CI/CD.
