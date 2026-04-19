---
name: docker-discipline
description: Docker compose, deploy fix, local verification, and cross-platform gotchas for Docker-producing units
trigger: when working with Dockerfiles, docker compose, deploy scripts, or Docker-producing units
---

# Docker Discipline

## Docker Compose and Worktrees

Bind-mount paths in a compose file are resolved relative to the compose file's location at `docker compose up` time and frozen into the container. If that source path later disappears (e.g. the worktree it lived in was deleted), mounts break silently — the container may still report healthy while the missing config causes port or feature regressions.

- **Before removing a worktree**, check for running stacks started from it: `docker inspect <container> --format '{{json .Mounts}}'`. Stop the stack before removing the worktree.
- **Container healthy ≠ all ports reachable.** A health check that probes one port (e.g. ClickHouse TCP 9000 via `clickhouse-client`) does not verify other ports (e.g. HTTP 8123). When a service is unreachable from sibling containers, inspect mount sources and listen addresses before assuming the health check is authoritative.
- **Long-lived shared stacks** (e.g. local Langfuse) should be started from a stable workspace, not a feature worktree, to avoid the bind-mount source disappearing mid-work.

## Deploy Fix Discipline

When fixing deploy failures, trace the full deploy path end-to-end before committing a fix — do not fix one layer and hope the rest works.

- Read the entire flow: SCP source list (`release-unit.yml`) → deploy script → Dockerfile → `docker build`.
- Test with `docker build` locally before pushing.
- Check for stale state on the target (VPS directories not cleaned by the deploy script).
- A single deploy fix PR should address all layers; multiple fix-tag-retry cycles waste CI time and money.

## Local Docker Verification for Docker Units

For any change that could affect the Docker build or runtime behavior of a Docker-producing unit, run a local Docker verification before pushing:

1. `docker build` — confirms the image builds (catches Dockerfile, .dockerignore, SwiftPM source discovery issues).
2. `docker run` with health/version check — confirms the container starts and responds correctly.
3. If the change affects logging or request handling, send a test request to the running container and verify the expected output in `docker logs`.

This applies to: Dockerfile changes, .dockerignore changes, Package.swift/Package.resolved changes, deploy script changes, source file additions/removals, and any change to structured logging or request handling.

**Mandatory**: for Docker-producing units (e.g. notio), ALWAYS run `docker build` before pushing — no exceptions. Do not push without a passing Docker build. CI deploys cost time and money — catch failures locally first.

## Swift on Linux: ByteBuffer ≠ Data

Foundation APIs (`JSONSerialization`, `JSONDecoder`, etc.) do not accept `ByteBuffer` on Linux. macOS may bridge implicitly, but Linux will not — this causes Docker build failures. Always convert via `Data(ByteBufferView(buffer))`. Do not use `NIOFoundationCompat`.
