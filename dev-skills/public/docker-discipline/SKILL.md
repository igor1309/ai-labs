---
name: docker-discipline
author: Igor Malyarov
version: "1.0.0"
description: Docker compose, deploy fix, local verification, and cross-platform gotchas for Docker-producing units
trigger: when working with Dockerfiles, docker compose, deploy scripts, or Docker-producing units
---

# Docker Discipline

## Docker Compose and Worktrees

Bind-mount paths in a compose file are resolved relative to the compose file's location at `docker compose up` time and frozen into the container. If that source path later disappears (e.g. the worktree it lived in was deleted), mounts break silently — the container may still report healthy while the missing config causes port or feature regressions.

- **Before removing a worktree**, check for running stacks started from it: `docker inspect <container> --format '{{json .Mounts}}'`. Stop the stack before removing the worktree.
- **Container healthy ≠ all ports reachable.** A health check that probes one port does not verify other ports. When a service is unreachable from sibling containers, inspect mount sources and listen addresses before assuming the health check is authoritative.
- **Long-lived shared stacks** should be started from a stable workspace, not a feature worktree, to avoid the bind-mount source disappearing mid-work.

## Deploy Fix Discipline

When fixing deploy failures, trace the full deploy path end-to-end before committing a fix — do not fix one layer and hope the rest works.

- Read the entire flow: source list → deploy script → Dockerfile → `docker build`.
- Test with `docker build` locally before pushing.
- Check for stale state on the target (directories not cleaned by the deploy script).
- A single deploy fix PR should address all layers; multiple fix-tag-retry cycles waste CI time and money.

## Local Docker Verification for Docker Units

For any change that could affect the Docker build or runtime behavior of a Docker-producing unit, run a local Docker verification before pushing:

1. `docker build` — confirms the image builds (catches Dockerfile, .dockerignore, source discovery issues).
2. `docker run` with health/version check — confirms the container starts and responds correctly.
3. If the change affects logging or request handling, send a test request to the running container and verify the expected output in `docker logs`.

This applies to: Dockerfile changes, .dockerignore changes, dependency manifest changes, deploy script changes, source file additions/removals, and any change to structured logging or request handling.

For Docker-producing units, ALWAYS run `docker build` before pushing — no exceptions. CI deploys cost time and money — catch failures locally first.

## Swift on Linux: ByteBuffer ≠ Data

Foundation APIs (`JSONSerialization`, `JSONDecoder`, etc.) do not accept `ByteBuffer` on Linux. macOS may bridge implicitly, but Linux will not — this causes Docker build failures. Always convert via `Data(ByteBufferView(buffer))`. Do not use `NIOFoundationCompat`.

## Completion verification

After Docker-related changes, verify:

- [ ] `docker build` passes locally.
- [ ] Container starts and health check passes.
- [ ] No bind-mount paths reference temporary or worktree-specific locations.
- [ ] Deploy fix PRs address all layers (source list, script, Dockerfile), not just one.
- [ ] Swift code uses `Data(ByteBufferView(buffer))`, not raw `ByteBuffer`, for Foundation APIs.
