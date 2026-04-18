---
title: ADR-005 Tag-Driven CI/CD to VPS with Runtime Version Verification
date: 2026-04-18
version: 0.0.1
author: OpenAI GPT-5.4 Thinking
status: accepted
type: adr
---

# ADR-005: Tag-Driven CI/CD to VPS with Runtime Version Verification

## Status

Accepted

## Context

The service is developed in a Git repository and deployed to a VPS.

A release workflow is required from day one with the following properties:

- CI runs tests
- artifact is built only on green
- artifact is deployed to the VPS
- deployment is verified after rollout
- verification must prove that the running service on the VPS reports the same version as the Git tag that triggered the pipeline

The required check is not merely that a container restarted or that an image exists in a registry. The required check is that the deployed service is reachable and reports the expected release version.

The service is intended to run as a containerized workload on a VPS. The deployment target is a real runtime environment, not a separate test surface.

## Decision

Use a tag-driven CI/CD pipeline with the following shape:

1. a Git tag triggers the release workflow
2. CI runs tests
3. on green, CI builds a Docker image for the service
4. CI pushes the image to a container registry
5. CI connects to the VPS over SSH and deploys the tagged image
6. CI verifies:
   - the service is running
   - the service is reachable
   - the service reports a version equal to the triggering tag

The release artifact is a Docker image tagged with the Git tag.

The post-deploy source of truth is the running application version exposed by the service.

## Why this was chosen

This approach gives a single explicit release chain:

- release intent starts from a Git tag
- artifact version matches the release identifier
- deployment is explicit
- runtime verification confirms the actual serving version

It also keeps the deployment contract simple and strict:

- no deploy on red
- no manual interpretation of rollout success
- no ambiguity about what version should be live

## Release flow

### Trigger

A Git tag starts the workflow.

### Build gate

The workflow must run tests before building and publishing the deployable artifact.

If tests fail:

- no artifact is published
- no deployment happens

### Artifact

The deployable artifact is a Docker image.

The image is tagged with the Git tag that triggered the workflow.

### Registry

CI pushes the built image to the selected container registry.

The registry choice is an implementation detail. The ADR does not require a specific registry, only a versioned container image addressable by tag.

### Deploy

CI deploys to the VPS over SSH.

The VPS updates to the newly tagged image and restarts the service.

Exact commands are implementation details, but the deployment must result in the VPS running the image corresponding to the triggering tag.

### Verify

After deployment, CI must verify both of the following:

1. the service is up
2. the service reports the exact release version equal to the triggering tag

This verification should happen against the deployed service itself.

## Runtime requirements on the service

To support deployment verification, the service must expose enough runtime information for CI to validate rollout.

Minimum required endpoints:

- a health endpoint
- a version endpoint

### Health endpoint

Purpose:

- confirm that the service is reachable and healthy enough to answer requests

### Version endpoint

Purpose:

- report the running service version
- return the release version expected by the pipeline

The version returned by the service must equal the Git tag that triggered the release workflow.

## Consequences

### Positive

- release flow is explicit and reproducible
- deployment happens only after tests pass
- runtime verification confirms the actually running version
- the release contract is simple and auditable
- VPS state is validated from CI, not assumed

### Negative

- the application must expose runtime version information
- the build/deploy pipeline must carry version information consistently into the running service
- CI requires SSH-based deploy access to the VPS
- the pipeline is responsible for rollout verification, not just artifact publication

## Options considered

### Option A — Tag-driven CI/CD with post-deploy runtime verification

Tag triggers tests, build, deploy, then health/version checks against the running service.

**Advantages**
- explicit release trigger
- strong deployment contract
- verifies actual runtime state
- matches the required behavior exactly

**Disadvantages**
- requires version exposure from the app
- requires deploy automation to the VPS

**Decision**
- selected

### Option B — Build and publish artifact only, deploy separately

CI produces the artifact, but deployment is manual or handled elsewhere.

**Advantages**
- simpler CI pipeline
- less CI responsibility

**Disadvantages**
- breaks the required end-to-end release contract
- deployment success is not part of the same workflow
- runtime version verification is detached from release

### Option C — Deploy and verify container state only

CI deploys to the VPS and checks container/process state, but does not verify the application-reported version.

**Advantages**
- easier to implement
- validates some deployment mechanics

**Disadvantages**
- insufficient for the required guarantee
- does not prove that the correct version is serving traffic

## Non-goals

This ADR does not define:

- exact CI provider workflow syntax
- exact registry choice
- exact Dockerfile structure
- exact VPS deploy commands
- rollback strategy
- secret management details

## Summary

The selected release contract is:

- tag triggers CI
- CI runs tests
- on green, CI builds and publishes the Docker image
- CI deploys the tagged image to the VPS
- CI verifies that the service is running and reports a version equal to the triggering tag

The success condition is the running service on the VPS reporting the expected tag.
