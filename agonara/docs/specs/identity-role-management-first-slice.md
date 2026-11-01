---
date: 2026-05-27
model: gpt-5.5-thinking
description: "Implementation spec for Agonara Identity & Role Management v0.0.1."
version: 0.0.1
status: implemented
type: spec
---

# Identity & Role Management First Slice

## Goal

Implement the Agonara Identity & Role Management v0.0.1 backend contract that bootstraps a private instance, authenticates a local password credential into an internal Identity, manages Admin authority, and enforces the first operational invariants.

The HTTP API, operator CLI, and executable acceptance scenarios are specified in [Identity & Role Management API and CLI](identity-role-management-api-cli.md).

## Implementation status

Implemented by [Identity and Operations First-Slice Implementation Plan](../plans/implemented/identity-and-operations-first-slice.md) and completed for the minimum Admin UI surface by [Admin Operations UI Board Implementation Plan](../plans/implemented/admin-operations-ui-board.md).

### Implementation Evidence

- Identity command/query boundary for bootstrap, local-password login, session resolution/logout, Admin authority, audit reads, and operational access: [identity.js](../../src/identity.js)
- Durable Identity, local-password credential, session, Admin authority, audit, and backup/restore state: [storage.js](../../src/storage.js)
- Focused domain and invariant coverage: [identity.test.js](../../tests/identity.test.js)
- Persistence invariant coverage: [storage.test.js](../../tests/storage.test.js)
- Backup/restore coverage for Identity, credentials, Admin authority, audit state, no-session restore, and last-Admin restore rejection: [backup-restore.test.js](../../tests/backup-restore.test.js)
- HTTP, CLI, and end-to-end acceptance coverage: [http-api-identity-session.test.js](../../tests/http-api-identity-session.test.js), [cli.test.js](../../tests/cli.test.js), and [executable-acceptance-identity-programs.test.js](../../tests/executable-acceptance-identity-programs.test.js)
- Minimum Admin UI surface implementation and route/render coverage: [admin-ui.js](../../src/admin-ui.js), [server.js](../../src/server.js), [http-api-identity-session.test.js](../../tests/http-api-identity-session.test.js), and [admin-operations-ui-board.md](../plans/implemented/admin-operations-ui-board.md)

The implemented slice supports first-Admin bootstrap, local-password authentication, opaque server-managed sessions, Admin-only identity and credential operations, last-effective-Admin protection, auditability, operational access inspection, backup/restore of identity state without active-session restoration, and the required private Admin UI board. It preserves the v0.0.1 boundary by leaving MFA, passkeys, OIDC, SSO, self-service recovery, multi-tenant authorization, Program resource permissions, Student authority, and Program Curator authority outside Identity & Role Management.

## Public interface

### Logical records

```ts
type IdentityState = "active" | "disabled";

type Identity = {
  id: IdentityId;
  displayName: string;
  state: IdentityState;
  createdAt: Instant;
  disabledAt?: Instant;
};

type LocalPasswordCredential = {
  id: CredentialId;
  identityId: IdentityId;
  login: string;
  passwordHash: string;
  createdAt: Instant;
};

type Session = {
  id: SessionId;
  identityId: IdentityId;
  createdAt: Instant;
  expiresAt: Instant;
  revokedAt?: Instant;
};

type AdminAuthority = {
  identityId: IdentityId;
  grantedAt: Instant;
  revokedAt?: Instant;
};

type AuditEvent = {
  id: AuditEventId;
  eventType: AuditEventType;
  actorIdentityId?: IdentityId;
  targetIdentityId?: IdentityId;
  targetCredentialId?: CredentialId;
  targetSessionId?: SessionId;
  occurredAt: Instant;
  outcome: "accepted" | "rejected";
  reason?: string;
};
```

`IdentityId`, `CredentialId`, `SessionId`, and `AuditEventId` are opaque stable identifiers.

### Commands

```ts
bootstrapFirstAdmin(input: {
  bootstrapSecret: string;
  displayName: string;
  login: string;
  password: string;
}) -> BootstrapFirstAdminResult

login(input: {
  login: string;
  password: string;
}) -> LoginResult

logout(input: {
  sessionId: SessionId;
}) -> LogoutResult

createIdentity(input: {
  actingSessionId: SessionId;
  displayName: string;
}) -> CreateIdentityResult

bindLocalPasswordCredential(input: {
  actingSessionId: SessionId;
  identityId: IdentityId;
  login: string;
  password: string;
}) -> BindLocalPasswordCredentialResult

disableIdentity(input: {
  actingSessionId: SessionId;
  identityId: IdentityId;
}) -> DisableIdentityResult

grantAdmin(input: {
  actingSessionId: SessionId;
  identityId: IdentityId;
}) -> GrantAdminResult

revokeAdmin(input: {
  actingSessionId: SessionId;
  identityId: IdentityId;
}) -> RevokeAdminResult
```

### Command Result Envelope

- `{ status: "accepted"; value: ... }`
- `{ status: "rejected"; reason: RejectionReason }`

### Queries

```ts
resolveSession(input: {
  sessionId: SessionId;
}) -> ResolveSessionResult

listIdentities(input: {
  actingSessionId: SessionId;
}) -> ListIdentitiesResult

getOperationalAccessState(input: {
  actingSessionId: SessionId;
  identityId: IdentityId;
}) -> OperationalAccessStateResult

listAuditEvents(input: {
  actingSessionId: SessionId;
  filter?: AuditEventFilter;
}) -> ListAuditEventsResult
```

`resolveSession` returns the resolved active `Identity` for a valid session or a rejected result. Other queries require effective Admin authority.

### Rejection reasons

```ts
type RejectionReason =
  | "invalid_bootstrap_secret"
  | "bootstrap_already_completed"
  | "invalid_credentials"
  | "session_not_found"
  | "session_expired"
  | "session_revoked"
  | "identity_disabled"
  | "admin_required"
  | "last_admin_removal"
  | "login_already_bound"
  | "identity_already_has_credential"
  | "identity_not_found"
  | "validation_failed";
```

### Minimum admin UI surface

The first UI may be thin, but it must expose these flows.

- first-Admin bootstrap;
- login and logout;
- identity list;
- identity creation;
- local password credential binding;
- identity disablement;
- Admin grant and revoke;
- operational access inspection for an Identity.

## Behavior rules

1. `bootstrapFirstAdmin` is accepted only when no effective Admin exists and `bootstrapSecret` matches the operator-controlled bootstrap secret.
2. `bootstrapFirstAdmin` creates one active Identity, one local password credential binding, one active Admin authority assignment, one accepted bootstrap audit event, and returns a session for the bootstrapped Identity.
3. `bootstrapFirstAdmin` rejects after any effective Admin exists.
4. The bootstrap secret is not stored as an Agonara credential, session, Identity, or role.
5. `login` verifies only local password credentials and never grants authority by itself.
6. `login` returns a server-managed opaque session when credentials are valid and the bound Identity is active.
7. `login` rejects when credentials are invalid or the bound Identity is disabled.
8. Passwords are never stored or compared as plaintext.
9. Password verification uses a vetted password-hashing implementation from the chosen implementation stack.
10. v0.0.1 password validation requires a non-empty login and a password of at least 12 characters.
11. Session identifiers are opaque, server-managed, revocable, and associated with one internal Identity.
12. New sessions expire 7 days after creation.
13. v0.0.1 does not expose refresh tokens or silent session extension.
14. `resolveSession` rejects expired, revoked, unknown, or disabled-Identity sessions.
15. `logout` revokes the session and does not disable the Identity or credential.
16. `createIdentity`, `bindLocalPasswordCredential`, `disableIdentity`, `grantAdmin`, `revokeAdmin`, `listIdentities`, `getOperationalAccessState`, and `listAuditEvents` require an active session whose resolved Identity has effective Admin authority.
17. Credential binding changes do not grant Admin, Student, or Program Curator authority.
18. v0.0.1 exposes at most one local password credential per Identity.
19. `bindLocalPasswordCredential` rejects a login that is already bound to any credential.
20. `bindLocalPasswordCredential` rejects when the target Identity already has a local password credential.
21. `disableIdentity` rejects when disabling the target would remove the last effective Admin.
22. `disableIdentity` invalidates active sessions for the target Identity.
23. Disabled Identities remain visible in Admin inspection and audit references.
24. `grantAdmin` creates or reactivates instance-scoped Admin authority for an active Identity.
25. `revokeAdmin` rejects when revoking the target would remove the last effective Admin.
26. Admin authority does not grant Student or Program Curator authority.
27. Resource-level permissions inside Programs are out of scope for v0.0.1.
28. Organization, team, tenant, and multi-tenant SaaS authorization models are out of scope for v0.0.1.
29. MFA, passkeys, OIDC, SSO, recovery codes, self-service credential recovery, reauthentication, and privileged-action confirmation are out of scope for v0.0.1.
30. Every accepted or rejected bootstrap, identity creation, credential-binding change, identity disablement, Admin grant, and Admin revoke operation creates an audit event.
31. Audit events for post-bootstrap operations include the acting internal Identity.
32. Rejected last-Admin removal attempts create rejected audit events.
33. Backup/restore scope includes Identities, local password credentials, Admin authority assignments, and audit events.
34. Backup export does not preserve active sessions as restorable login state.
35. A restored instance starts with no active sessions; users must authenticate again.
36. A restored instance must not become operational if it has no effective Admin.

## Tests (required)

### Bootstrap

1. `bootstrapFirstAdmin` accepts with a valid bootstrap secret when no effective Admin exists.
2. `bootstrapFirstAdmin` creates Identity, local password credential, Admin authority, session, and accepted audit event.
3. `bootstrapFirstAdmin` rejects with `invalid_bootstrap_secret` for a wrong bootstrap secret.
4. `bootstrapFirstAdmin` rejects with `bootstrap_already_completed` after an effective Admin exists.
5. Bootstrap secret is not persisted as an Identity, credential, session, role, or audit actor.

### Login and Session

6. `login` accepts valid credentials for an active Identity and returns an opaque session.
7. `login` rejects invalid credentials with `invalid_credentials`.
8. `login` rejects when the bound Identity is disabled.
9. Password hashes are stored instead of plaintext passwords.
10. Password shorter than 12 characters is rejected with `validation_failed`.
11. `resolveSession` accepts a known unexpired session for an active Identity.
12. `resolveSession` rejects unknown, expired, revoked, and disabled-Identity sessions.
13. New sessions expire 7 days after creation.
14. No refresh-token or silent session-extension path is exposed.
15. `logout` revokes the session.

### Admin Authorization

16. Admin-only commands reject without a valid session.
17. Admin-only commands reject for a valid session whose Identity lacks Admin authority.
18. `createIdentity` accepts for an Admin session.
19. `bindLocalPasswordCredential` accepts for an Admin session and active target Identity.
20. `bindLocalPasswordCredential` rejects duplicate login.
21. `bindLocalPasswordCredential` rejects when the target Identity already has a local password credential.
22. `bindLocalPasswordCredential` does not grant Admin authority.
23. `grantAdmin` accepts for an Admin session and active target Identity.
24. `revokeAdmin` rejects when the target is the last effective Admin.
25. `disableIdentity` rejects when the target is the last effective Admin.
26. `disableIdentity` revokes or invalidates active sessions for the target Identity.
27. Disabled Identities remain inspectable.

### Audit

28. Accepted identity creation creates an audit event with actor and target Identity.
29. Accepted credential binding creates an audit event with actor, target Identity, and target credential.
30. Accepted Admin grant and revoke create audit events with actor and target Identity.
31. Rejected last-Admin revoke creates a rejected audit event.
32. Rejected last-Admin disable creates a rejected audit event.
33. Audit queries require Admin authority.

### Deferrals

34. No API or UI path grants Student or Program Curator authority from Identity & Role Management.
35. No resource-level Program permission is represented in Identity & Role Management v0.0.1.
36. No organization, team, tenant, or multi-tenant authority model is represented in Identity & Role Management v0.0.1.
37. No MFA, passkey, OIDC, SSO, recovery-code, or self-service credential recovery path is exposed in v0.0.1.

### Backup and Restore

38. Backup export includes Identity, local password credential, Admin authority, and audit state.
39. Backup export does not restore active sessions as login state.
40. Restore starts with no active sessions.
41. Restore rejects or refuses activation when restored state has no effective Admin.
42. Restore preserves historical audit references to disabled Identities.

## Done criteria

- The implementation exposes the command and query surface defined above.
- Logical records or equivalent persisted state cover Identity, local password credential, session, Admin authority, and audit events.
- All required tests pass.
- Tests prove credentials, sessions, and credential bindings do not grant product or operational authority by themselves.
- Tests prove the last-effective-Admin invariant for Admin revocation, Identity disablement, and restore activation.
- The minimal admin UI surface can execute the bootstrap, login/logout, identity, credential-binding, Admin authority, and inspection flows.
- The external HTTP API, operator CLI, and executable acceptance scenarios match [Identity & Role Management API and CLI](identity-role-management-api-cli.md).
- Backup/restore includes the Identity & Role Management state required by this spec and does not restore active sessions.
