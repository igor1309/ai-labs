---
title: "ADR-005: Cloudflare Access for User Authentication"
date: 2026-05-02
model: gpt-5
description: "Replace Clipdeck's user-facing shared secret with Cloudflare Access email-based authentication while preserving Worker-only GitHub credentials"
status: accepted
artifact_type: adr
---

# ADR-005: Cloudflare Access for User Authentication

## Executive Summary

Clipdeck will move user-facing authentication from an app-level shared secret to Cloudflare Access protecting `clipdeck.enoa.ai`. The only allowed human principal is the owner's primary identity in Cloudflare Access. This supersedes ADR-001's shared-secret access invariant while preserving ADR-001's core runtime boundary: the browser still never receives GitHub credentials or raw GitHub API responses. The GitHub PAT remains a Cloudflare Workers Secret governed by ADR-002.

## Context

ADR-001 deliberately chose a single shared access secret for v1 because Clipdeck was a private, single-user, low-operational-burden page. That choice worked as a bootstrap mechanism but creates recurring usability friction: the user must store, retrieve, and enter an opaque secret, especially awkward on iPhone.

The current deployment topology already runs Clipdeck on Cloudflare Workers with a custom domain (`clipdeck.enoa.ai`) governed by ADR-003. Cloudflare Access can protect a public hostname before traffic reaches the Worker, using the user's existing Cloudflare account and stable primary identity. This matches the actual product shape better than carrying user authentication inside Clipdeck's application code.

Relevant constraints:

- Clipdeck remains a one-user private tool.
- The user's primary Cloudflare identity is stable and known to the operator.
- The browser MUST NOT receive the GitHub PAT.
- CI MUST NOT read or mutate the runtime GitHub PAT, per ADR-004.
- The production Worker remains the single frontend/API origin, per ADR-003.

Rejected alternatives:

- Keep the shared secret and rely on iCloud Keychain or notes — no code change, but preserves the main UX problem and keeps recovery/rotation informal.
- App-issued unlock link plus long-lived cookie — improves typing friction, but moves session issuance, cookie security, expiry, and revocation logic into Clipdeck.
- HTTP Basic Auth — easy to store in password managers, but still another password and awkward on home-screen iPhone usage.
- OAuth inside Clipdeck — solid identity model, but adds callback handling, session state, CSRF/state validation, expiry, and recovery complexity that Cloudflare Access already provides.
- Passkeys/WebAuthn inside Clipdeck — best long-term UX for a multi-user product, but overbuilt for one owner and requires credential registration, challenge storage, revocation, and recovery.

## Decision

Clipdeck production access MUST be protected by Cloudflare Access at the canonical hostname. The Access policy MUST allow only the owner's primary Cloudflare Access identity unless a future ADR expands Clipdeck beyond single-user use.

Cloudflare Access becomes the user-facing authentication layer for both the static page and `GET /api/items`. The Clipdeck Worker remains responsible for GitHub access, source allowlisting, sanitization, and API response shape.

This ADR supersedes ADR-001's rule that the webpage and API MUST be gated by a single shared secret. All other ADR-001 rules remain in force unless explicitly superseded here.

## Rules / Invariants

### Access boundary

- Production Clipdeck MUST be protected by a Cloudflare Access self-hosted application bound to `clipdeck.enoa.ai`.
- The Access application MUST cover the whole hostname, including static assets and `/api/items`.
- The Access policy MUST allow only the owner's primary Cloudflare Access identity.
- The concrete email address or identity selector belongs in Cloudflare configuration and operator runbooks, not in this ADR.
- The Access policy MUST be deny-by-default for every other identity.
- Authentication MUST happen before unauthenticated public traffic reaches the Worker.

### Identity method

- Email one-time PIN is an acceptable identity method for v1.
- A Cloudflare-supported identity provider tied to the same owner identity MAY be used instead of one-time PIN if it does not broaden the allowed principal set.
- Adding additional users, groups, organizations, service tokens, device posture rules, or role distinctions requires a new ADR or an explicit amendment to this ADR.

### Worker responsibilities

- The Worker MUST continue to be the only Clipdeck runtime component that holds the GitHub PAT.
- The Worker MUST continue to read the GitHub PAT only from Cloudflare Workers Secrets, per ADR-002 and ADR-003.
- The browser MUST NOT receive the GitHub PAT, raw GitHub API responses, YAML front matter, or data outside ADR-001's allowlisted source paths.
- The Worker MAY remove the app-level shared-secret check after Cloudflare Access is active for the production hostname.
- If an app-level fallback secret remains during migration, it MUST be treated as temporary compatibility logic and MUST NOT be the final production access boundary.

### CI/CD and deploy verification

- Production deploys remain tag-driven through `release-unit.yml`, per ADR-004.
- CI MUST NOT read Cloudflare Access session cookies, one-time PINs, user credentials, or the runtime GitHub PAT.
- ADR-004's unauthenticated `GET /api/items` deploy check MUST be amended during implementation because Cloudflare Access will intercept unauthenticated requests before the Worker returns its own `401`.
- Post-deploy verification MAY assert Cloudflare Access denial/redirect behavior for unauthenticated requests, but MUST NOT require CI to authenticate as the owner.

### Secret lifecycle

- The user-facing `SHARED_SECRET` value is deprecated by this ADR.
- Once production Cloudflare Access is verified, `SHARED_SECRET` MUST be removed from the Worker secret set unless retained only for a documented rollback window.
- The GitHub `GITHUB_TOKEN` secret remains governed by ADR-002 and is not deprecated.

## Consequences

Benefits:

- The user no longer needs to store or type a Clipdeck-specific shared secret.
- Authentication moves to Cloudflare's purpose-built Access layer rather than custom application logic.
- The browser still never receives GitHub credentials.
- The design stays single-user and avoids adding a database, session store, OAuth implementation, or passkey registration flow to Clipdeck.

Tradeoffs accepted:

- Clipdeck availability now depends on Cloudflare Access configuration in addition to the Worker deployment.
- The first visit on a new device/browser requires Cloudflare Access authentication.
- CI's existing locked-endpoint verification must change because unauthenticated traffic will be handled by Access before the Worker.
- Debugging auth failures may involve Cloudflare Access policy/session state, not only Worker logs.
- Changing the identity model from single-owner access to any broader principal set requires an amendment or successor ADR.

Future extension points:

- Expanding Clipdeck to more users would require a new identity and authorization ADR.
- Adding service-token access for machine checks would require an amendment because it introduces a non-human principal.
- Adding an authenticated live smoke test could use Cloudflare Access service auth, but that is explicitly future work.

## Non-Goals

- no multi-user Clipdeck access
- no roles, groups, or organization-wide policies
- no OAuth implementation inside Clipdeck
- no passkey/WebAuthn implementation inside Clipdeck
- no database, KV, Durable Object, or session store for authentication
- no CI access to the owner's Cloudflare Access session
- no change to the GitHub PAT lifecycle from ADR-002
- no change to source allowlisting, sanitization, item shape, or frontend copy behavior from ADR-001
