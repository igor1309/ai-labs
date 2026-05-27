---
date: 2026-05-27
model: gpt-5.5-thinking
description: "Implementation spec for Agonara Identity & Role Management v0.0.1."
version: 0.0.1
status: draft
type: spec
---

# Identity & Role Management First Slice

## Goal

Implement the Agonara Identity & Role Management v0.0.1 backend contract that bootstraps a private instance, authenticates a local password credential into an internal Identity, manages Admin authority, and enforces the first operational invariants.

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
  disabledAt?: Instant;
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

Each command result is either:

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
  | "identity_not_found"
  | "credential_not_found"
  | "validation_failed";
```

### Minimum admin UI surface

The first UI may be thin, but it must expose these flows:

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
7. `login` rejects when credentials are invalid, the credential is disabled, or the bound Identity is disabled.
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
18. v0.0.1 exposes at most one active local password credential per Identity.
19. `bindLocalPasswordCredential` rejects a login that is already bound to any active credential.
20. `disableIdentity` rejects when disabling the target would remove the last effective Admin.
21. `disableIdentity` invalidates active sessions for the target Identity.
22. Disabled Identities remain visible in Admin inspection and audit references.
23. `grantAdmin` creates or reactivates instance-scoped Admin authority for an active Identity.
24. `revokeAdmin` rejects when revoking the target would remove the last effective Admin.
25. Admin authority does not grant Student or Program Curator authority.
26. Resource-level permissions inside Programs are out of scope for v0.0.1.
27. Organization, team, tenant, and multi-tenant SaaS authorization models are out of scope for v0.0.1.
28. MFA, passkeys, OIDC, SSO, recovery codes, self-service credential recovery, reauthentication, and privileged-action confirmation are out of scope for v0.0.1.
29. Every accepted or rejected bootstrap, identity creation, credential-binding change, identity disablement, Admin grant, and Admin revoke operation creates an audit event.
30. Audit events for post-bootstrap operations include the acting internal Identity.
31. Rejected last-Admin removal attempts create rejected audit events.
32. Backup/restore scope includes Identities, local password credentials, sessions, Admin authority assignments, and audit events.
33. A restored instance must not become operational if it has no effective Admin.

## Tests (required)

Bootstrap:

1. `bootstrapFirstAdmin` accepts with a valid bootstrap secret when no effective Admin exists.
2. `bootstrapFirstAdmin` creates Identity, local password credential, Admin authority, session, and accepted audit event.
3. `bootstrapFirstAdmin` rejects with `invalid_bootstrap_secret` for a wrong bootstrap secret.
4. `bootstrapFirstAdmin` rejects with `bootstrap_already_completed` after an effective Admin exists.
5. Bootstrap secret is not persisted as an Identity, credential, session, role, or audit actor.

Login and session:

6. `login` accepts valid credentials for an active Identity and returns an opaque session.
7. `login` rejects invalid credentials with `invalid_credentials`.
8. `login` rejects a disabled credential.
9. `login` rejects when the bound Identity is disabled.
10. Password hashes are stored instead of plaintext passwords.
11. Password shorter than 12 characters is rejected with `validation_failed`.
12. `resolveSession` accepts a known unexpired session for an active Identity.
13. `resolveSession` rejects unknown, expired, revoked, and disabled-Identity sessions.
14. New sessions expire 7 days after creation.
15. No refresh-token or silent session-extension path is exposed.
16. `logout` revokes the session.

Admin authorization:

17. Admin-only commands reject without a valid session.
18. Admin-only commands reject for a valid session whose Identity lacks Admin authority.
19. `createIdentity` accepts for an Admin session.
20. `bindLocalPasswordCredential` accepts for an Admin session and active target Identity.
21. `bindLocalPasswordCredential` rejects duplicate active login.
22. `bindLocalPasswordCredential` does not grant Admin authority.
23. `grantAdmin` accepts for an Admin session and active target Identity.
24. `revokeAdmin` rejects when the target is the last effective Admin.
25. `disableIdentity` rejects when the target is the last effective Admin.
26. `disableIdentity` revokes or invalidates active sessions for the target Identity.
27. Disabled Identities remain inspectable.

Audit:

28. Accepted identity creation creates an audit event with actor and target Identity.
29. Accepted credential binding creates an audit event with actor, target Identity, and target credential.
30. Accepted Admin grant and revoke create audit events with actor and target Identity.
31. Rejected last-Admin revoke creates a rejected audit event.
32. Rejected last-Admin disable creates a rejected audit event.
33. Audit queries require Admin authority.

Deferrals:

34. No API or UI path grants Student or Program Curator authority from Identity & Role Management.
35. No resource-level Program permission is represented in Identity & Role Management v0.0.1.
36. No organization, team, tenant, or multi-tenant authority model is represented in Identity & Role Management v0.0.1.
37. No MFA, passkey, OIDC, SSO, recovery-code, or self-service credential recovery path is exposed in v0.0.1.

Backup and restore:

38. Backup export includes Identity, local password credential, session, Admin authority, and audit state.
39. Restore rejects or refuses activation when restored state has no effective Admin.
40. Restore preserves historical audit references to disabled Identities.

## Done criteria

- The implementation exposes the command and query surface defined above.
- Logical records or equivalent persisted state cover Identity, local password credential, session, Admin authority, and audit events.
- All required tests pass.
- Tests prove credentials, sessions, and credential bindings do not grant product or operational authority by themselves.
- Tests prove the last-effective-Admin invariant for Admin revocation, Identity disablement, and restore activation.
- The minimal admin UI surface can execute the bootstrap, login/logout, identity, credential-binding, Admin authority, and inspection flows.
- Backup/restore includes the Identity & Role Management state required by this spec.
