---
name: rest-contract-review
version: "1.0.0"
description: Review REST API contracts (OpenAPI/Swagger specs, JSON schemas, endpoint definitions) for quality and cross-endpoint consistency. Use when reviewing API spec PRs, validating JSON schema changes before implementation, auditing existing contracts for breaking changes, or investigating contract-related decoding failures.
---

# REST Contract Review

Systematic review of REST API contracts for quality and consistency.

## Scope

Review applies to: OpenAPI specs, JSON schemas, response/request examples.

Skip sections if artifacts unavailable:
- No OpenAPI spec → skip Documentation Alignment
- New API (no existing endpoints) → skip Versioning & Evolution

## Review Checklist

### 1. Key Naming
- [ ] No Cyrillic or non-ASCII characters in keys — watch for look-alikes (е/e, а/a, о/o, с/c, р/p, х/x) often introduced by copy-pasting from specs
- [ ] Consistent case style (camelCase or snake_case) — match existing API convention
- [ ] Natural English word order (`lockSuccess` not `successLock`, `createdAt` not `atCreated`)
- [ ] No redundant prefixes (`user.userName` → `user.name`)
- [ ] Abbreviations are universally understood or avoided
- [ ] Singular/plural nouns used appropriately (collections plural, resources singular)
- [ ] Arrays use `List` suffix (`userList`, `itemList`) — established pattern
- [ ] Boolean fields use `is`/`has`/`can` prefixes (for new fields; don't require renaming existing)

### 2. Data Types & Structure
- [ ] Consistent types for semantically similar fields across endpoints
- [ ] Nesting depth reasonable (ask: does deeper nesting add clarity or just complexity?)
- [ ] Arrays vs objects used correctly
- [ ] Nullable fields explicitly defined
- [ ] Date/time formats consistent (prefer ISO 8601)
- [ ] Enum values documented and consistent
- [ ] IDs have consistent type (string vs integer)

**Contract invariants:**
- [ ] Fields that must always be present in success responses identified
- [ ] Fields that must always be present in error responses identified
- [ ] Field types that must never change across versions identified

### 3. Response Structure
- [ ] Envelope pattern consistent with existing API (not abstract "best practice")
- [ ] Error response format matches established pattern
- [ ] Pagination format consistent across list endpoints
- [ ] HTTP status codes match response semantics
- [ ] Empty states: document chosen approach (empty array / null / omitted) and apply consistently

### 4. Documentation Alignment
- [ ] Schema matches actual response examples
- [ ] Required vs optional fields clearly marked
- [ ] Field descriptions present and accurate
- [ ] Examples provided and valid
- [ ] Deprecated fields marked

### 5. Versioning & Evolution
*Apply only when modifying existing contract:*
- [ ] Backward compatibility considered
- [ ] Breaking changes identified
- [ ] Deprecation annotations present where needed

## Review Process

1. **Identify anchor endpoints** — existing endpoints to use as consistency reference
2. **Scan for mechanical issues** — naming, types, formatting
3. **Check cross-endpoint consistency** — compare against anchors
4. **Consider consumer perspective** — is this intuitive for frontend/external devs?

## Output Format

```
## Summary
[1-2 sentence overview]

## Decision
Accept / Accept with changes / Needs rework

## Rationale
- [key trade-off or risk that drove the decision]
- [...]

## Critical Issues
- [blocking issues that must be fixed]

## Recommendations
- [improvements with clear risk/trade-off explanation]

## Minor Suggestions
- [observations, not requirements]
```
