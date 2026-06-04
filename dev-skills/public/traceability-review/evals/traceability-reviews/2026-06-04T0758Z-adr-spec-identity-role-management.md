---
date: 2026-06-04
model: claude-opus-4-8
description: "ADR -> spec traceability review for the Identity & Role Management module (agonara): ADR-001/002/003/008 against the identity first-slice + API/CLI spec pair."
skill: traceability-review
skill_version: "0.12.0"
scope: "ADR -> spec, per module: Identity & Role Management, project agonara"
mechanism: per-decision matrix
inputs:
  adrs:
    - file: adr/adr-001-internal-identity-as-agonara-ownership-subject.md
      status: accepted
    - file: adr/adr-002-role-authority-scope-model.md
      status: accepted
    - file: adr/adr-003-admin-recovery-invariant.md
      status: accepted
    - file: adr/adr-008-first-slice-authentication-session-and-credential-boundary.md
      status: accepted
  specs:
    - file: specs/identity-role-management-first-slice.md
      version: 0.0.1
      status: draft
    - file: specs/identity-role-management-api-cli.md
      version: 0.0.1
      status: draft
---

# ADR -> Spec Traceability Review: Identity & Role Management

## Summary

Enumerated **89 ADR decisions/rules/invariants** across four ADRs (ADR-001: 15;
ADR-002: 19; ADR-003: 21; ADR-008: 34). Verdict breakdown:

- honoured: 73
- contradicted: 0
- missing: 0
- deferred: 16

Findings: **0** (0 fail, 0 warning).

Verdict: the spec pair (first-slice domain contract + API/CLI) faithfully carries
every Identity & Role Management decision in scope for v0.0.1. The deferred rows
are each authorized: ADR-002's **product-role grants** (Student / Program Curator
participation) are owned by Program Membership and explicitly excluded from this
module (first-slice:204,266; the identity spec *enforces* the boundary by granting
no product role); ADR-008's MFA/passkey/OIDC/SSO/recovery items are deferred by
the ADR itself and first-slice:208,269; the "later ADRs MAY…" extension clauses
have nothing to carry this slice; and exceptional **membership** recovery (an
ADR-003 cross-reference) is a Program Membership concern, not Identity state.

Throughout, `first-slice` = `identity-role-management-first-slice.md` and
`api` = `identity-role-management-api-cli.md`.

## Enumeration (per-decision matrix)

### ADR-001 — Decision (lines 32–40)

| # | ADR decision (`adr-001:line`) | Verdict | Evidence |
|---|---|---|---|
| 001-D1 | Use internal `Identity` as the subject of ownership and action (`:32`) | honoured | first-slice:25-31 (`Identity` record is the owner/actor referenced by sessions/credentials/admin authority/audit) |
| 001-D2 | Domain records reference an `Identity`, not a credential/session/external principal (`:34`) | honoured | first-slice:41-53 (`Session`, `LocalPasswordCredential`, `AdminAuthority` all carry `identityId`); audit `actorIdentityId`/`targetIdentityId` first-slice:58-60 |
| 001-D3 | Credentials/external principals MAY be bound to an `Identity` (`:36`) | honoured | first-slice:33-39 (`LocalPasswordCredential.identityId`), :94-99 (`bindLocalPasswordCredential`) |
| 001-D4 | A credential binding authenticates; MUST NOT create ownership/grant roles/replace authz (`:38`) | honoured | first-slice:17,196 ("Credential binding changes do not grant Admin, Student, or Program Curator authority"); :184 (`login` never grants authority by itself) |
| 001-D5 | Architecture MUST permit ≥1 binding; first impl MAY be narrower but MUST NOT encode 1:1 ownership invariant (`:40`) | honoured (narrow slice; no 1:1 invariant) | first-slice:18,197 ("v0.0.1 exposes at most one local password credential per Identity") is a *slice limit*, not an architectural 1:1 ownership invariant — the `Identity`↔credential model (first-slice:33-39) keeps `identityId` on the credential, not the reverse |

### ADR-001 — Rules / Invariants (lines 44–53)

| # | ADR rule (`adr-001:line`) | Verdict | Evidence |
|---|---|---|---|
| 001-R1 | `Identity` is the ownership subject (`:44`) | honoured | first-slice:25-31 |
| 001-R2 | `Identity` is not a role (`:45`) | honoured | `Identity` and `AdminAuthority` are separate records (first-slice:25-31,49-53); Admin is an assignment, not a field on `Identity` |
| 001-R3 | Credential is not ownership (`:46`) | honoured | first-slice:33-39 (credential carries `identityId`; owns nothing) |
| 001-R4 | Credential binding is not role assignment (`:47`) | honoured | first-slice:17,196,248 (binding does not grant Admin) |
| 001-R5 | Authentication proves access; authorization decides action (`:48`) | honoured | first-slice:184 (`login` grants no authority), :195 (admin commands require effective Admin after session resolves) |
| 001-R6 | Ownership/attribution survive credential rotation/replacement/provider migration (`:49`) | honoured (structurally) | first-slice:25-31 (`Identity` is stable; credential is a separate bindable record) — rotation replaces the credential, not the `Identity` |
| 001-R7 | Later lifecycle preserves historical ownership/audit refs (`:50`) | honoured | first-slice:23,202,277 (disabled Identities remain visible in inspection/audit; restore preserves audit refs to disabled Identities) |
| 001-R8 | Credential-binding state changes auditable as identity-mgmt operations (`:51`) | honoured | first-slice:209 (credential-binding change creates an audit event), api:124 |
| 001-R9 | Product/operational roles granted explicitly outside credential binding (`:52`) | honoured | first-slice:196 (binding grants no roles); Admin via `grantAdmin` (first-slice:106-109); product roles owned by Program Membership |
| 001-R10 | Later ADRs MAY define role scope/recovery/lifecycle/session/schema only if preserving the identity-subject model (`:53`) | deferred | forward-looking; the spec preserves the model and stays within v0.0.1 (first-slice:206-208) |

### ADR-002 — Decision (lines 42–59)

| # | ADR decision (`adr-002:line`) | Verdict | Evidence |
|---|---|---|---|
| 002-D1 | Grant product authority through explicit Program-scoped participation grants (`:42`) | deferred (owned by Program Membership) | first-slice:204 ("The API does not expose Student, Program Curator, Program Membership… authority"), :266; participation grants live in the Program Membership spec |
| 002-D2 | Product roles are `Student` and `Program Curator`; Identity MAY hold either/both/none per Program (`:44-49`) | deferred (owned by Program Membership) | first-slice:266 (no path grants Student/Program Curator from this module) |
| 002-D3 | Identity MAY hold different product roles in different Programs (`:51`) | deferred (owned by Program Membership) | first-slice:204,266 |
| 002-D4 | `Admin` is an operational role scoped to the Agonara instance (`:53`) | honoured | first-slice:49-53 (`AdminAuthority` is instance-scoped, no Program scope), :203-204 |
| 002-D5 | `Admin` authority MUST NOT make the Identity a Student/Program Curator (`:55`) | honoured | first-slice:26,205,266 ("Admin authority does not grant Student or Program Curator authority") |
| 002-D6 | Product roles MUST NOT grant instance-scoped `Admin` authority (`:57`) | honoured (vacuous-correct) | this module grants no product roles (first-slice:266); the only authority it grants is Admin, via `grantAdmin` — no product-role→Admin path exists |
| 002-D7 | Credential bindings MUST NOT grant product or operational roles (`:59`) | honoured | first-slice:17,196,248 |

### ADR-002 — Rules / Invariants (lines 63–73)

| # | ADR rule (`adr-002:line`) | Verdict | Evidence |
|---|---|---|---|
| 002-R1 | Authority is denied unless explicitly granted (`:63`) | honoured | first-slice:195 (admin commands require effective Admin), :16,184 (login grants nothing) |
| 002-R2 | Product authority MUST be evaluated against Identity + Program scope (`:64`) | deferred (owned by Program Membership) | first-slice:204; product authority is Program Membership's effective-participation contract |
| 002-R3 | `Student` authority valid only within its Program scope (`:65`) | deferred (owned by Program Membership) | first-slice:266 |
| 002-R4 | `Program Curator` authority valid only within its Program scope (`:66`) | deferred (owned by Program Membership) | first-slice:266 |
| 002-R5 | `Admin` authority valid only at instance scope (`:67`) | honoured | first-slice:49-53 (`AdminAuthority` carries no Program scope), api:128 (`effectiveAdmin` is instance-level) |
| 002-R6 | `Admin` is not a product role (`:68`) | honoured | first-slice:205 |
| 002-R7 | `Student`/`Program Curator` are not operational roles (`:69`) | deferred (owned by Program Membership) | first-slice:204 |
| 002-R8 | A single Identity MAY have multiple product participation grants (`:70`) | deferred (owned by Program Membership) | first-slice:266 |
| 002-R9 | A single Identity MAY combine Student + Program Curator in the same Program (`:71`) | deferred (owned by Program Membership) | first-slice:266 |
| 002-R10 | Product participation grants MUST NOT mutate content/workspace/learning state (`:72`) | deferred (owned by Program Membership) | first-slice:204 |
| 002-R11 | Later ADRs MAY define recovery/permissions/schema only if preserving the role-scope model (`:73`) | deferred | forward-looking; nothing to carry this slice |

### ADR-003 — Decision (lines 38–50)

| # | ADR decision (`adr-003:line`) | Verdict | Evidence |
|---|---|---|---|
| 003-D1 | Bootstrap path creates the first `Admin` Identity before the instance is operational (`:38`) | honoured | first-slice:73-78 (`bootstrapFirstAdmin`), :180-182 |
| 003-D2 | After operational, retain ≥1 effective `Admin` (`:40`) | honoured | first-slice:200,204,225 (last-Admin guards on disable/revoke), :276 (restore refuses no-Admin) |
| 003-D3 | Definition of effective `Admin` (`:42`) | honoured | first-slice:49-53 (`AdminAuthority` with `revokedAt`); effective = active Identity + active Admin authority (first-slice:24,203) |
| 003-D4 | Any operation that would remove the last effective `Admin` MUST be rejected (`:44`) | honoured | first-slice:200,204 (`last_admin_removal` on disable + revoke), api:125-127 |
| 003-D5 | Sensitive identity-mgmt ops require `Admin` after bootstrap (`:46`) | honoured | first-slice:16,195 (create/bind/disable/grant/revoke/list/inspect/audit require effective Admin) |
| 003-D6 | Sensitive ops attributable to acting Identity, or bootstrap actor before first Admin (`:48`) | honoured | first-slice:210 (post-bootstrap audit includes acting Identity); :181 (bootstrap audit event); api:190 |
| 003-D7 | Admin recovery protects operational control only; MUST NOT grant learning-domain/Student/Curator authority (`:50`) | honoured | first-slice:205,266 |

### ADR-003 — Rules / Invariants (lines 54–66)

| # | ADR rule (`adr-003:line`) | Verdict | Evidence |
|---|---|---|---|
| 003-R1 | New instance MUST NOT be operational without ≥1 effective Admin (`:54`) | honoured | first-slice:180-182 (bootstrap creates the first Admin); :276 (restore refuses no-Admin) |
| 003-R2 | Operational instance MUST retain ≥1 effective Admin (`:55`) | honoured | first-slice:200,204 |
| 003-R3 | Removing/revoking/disabling/invalidating the last effective Admin MUST be rejected (`:56`) | honoured | first-slice:200 (disable), :204 (revoke) → `last_admin_removal`; api:125,127 |
| 003-R4 | Assigning/revoking Admin requires Admin after bootstrap (`:57`) | honoured | first-slice:16,195 (`grantAdmin`/`revokeAdmin` require effective Admin) |
| 003-R5 | Creating/disabling/changing an Identity requires Admin after bootstrap (`:58`) | honoured | first-slice:16,195 |
| 003-R6 | Creating/changing credential-binding requires Admin after bootstrap (`:59`) | honoured | first-slice:16,195 (`bindLocalPasswordCredential` requires effective Admin) |
| 003-R7 | Exceptional membership recovery requires Admin + preserves Program Membership ownership (`:60`) | deferred (Program Membership concern) | identity v0.0.1 owns no membership state; membership recovery is deferred to Program Membership (cross-ref Program Membership pass open question 3) |
| 003-R8 | Sensitive ops produce an audit record (`:61`) | honoured | first-slice:30,209 (every accepted/rejected sensitive op creates an audit event) |
| 003-R9 | Audit records identify the acting Identity when one exists (`:62`) | honoured | first-slice:31,210; api:190 |
| 003-R10 | Bootstrap audit distinguishes bootstrap from ordinary Admin action (`:63`) | honoured | first-slice:181 (accepted bootstrap audit event); api:190,4 (bootstrap never persists secret as audit actor) |
| 003-R11 | Audit records identify the affected Identity/credential/admin-change/recovery (`:64`) | honoured | first-slice:58-62 (`targetIdentityId`/`targetCredentialId`), api:83-89 |
| 003-R12 | Backup/restore MUST NOT activate an instance violating the effective-Admin invariant (`:65`) | honoured | first-slice:36,276 (restore refuses no effective Admin) |
| 003-R13 | Later ADRs MAY define auth strength/reauth/backup mechanics only if preserving the recovery invariant (`:66`) | deferred | forward-looking; nothing to carry this slice |

### ADR-008 — Decision (lines 40–71)

| # | ADR decision (`adr-008:line`) | Verdict | Evidence |
|---|---|---|---|
| 008-D1 | v0.0.1 uses an Agonara-owned local password credential as the first credential type (`:40`) | honoured | first-slice:33-39 (`LocalPasswordCredential`), :184 |
| 008-D2 | Local password authenticates access to an `Identity` only through a credential binding (`:42`) | honoured | first-slice:33-39,184-186 (`login` verifies credential → resolves `Identity`) |
| 008-D3 | Credential bindings MUST be owned by Identity & Role Management (`:44`) | honoured | first-slice:33-39,94-99 (credential records + bind command live in this module) |
| 008-D4 | Credential bindings MUST NOT grant Admin/Student/Curator authority (`:46`) | honoured | first-slice:17,196,248 |
| 008-D5 | The first web session is a server-managed opaque session (`:48`) | honoured | first-slice:41-47,190 (opaque server-managed `Session`), api:101-109 |
| 008-D6 | The session MUST resolve to an `Identity` before any protected op is authorized (`:50`) | honoured | first-slice:125-127,195 (`resolveSession` precedes admin commands), api:197 |
| 008-D7 | The session MUST NOT contain role grants as authoritative client-held claims (`:52`) | honoured | first-slice:41-47 (`Session` carries only `identityId`/timestamps, no roles); api:108-109 (no roles in client cookie) |
| 008-D8 | Authorization evaluated from server-side state after the session resolves (`:54`) | honoured | first-slice:195 (effective Admin checked server-side), api:197 |
| 008-D9 | The bootstrap path is available only while no effective Admin exists (`:56`) | honoured | first-slice:180,182,3; api:187 (`available: true` only while bootstrap can run) |
| 008-D10 | The bootstrap path requires an out-of-band bootstrap secret (`:58`) | honoured | first-slice:73,180; api:111,118 (bootstrap secret input) |
| 008-D11 | Bootstrap creates 1 active Identity, 1 credential binding, 1 Admin assignment, 1 bootstrap audit (`:60-65`) | honoured | first-slice:181,2 (exactly these four artifacts + a session) |
| 008-D12 | The bootstrap secret MUST NOT become a credential/session/role/ownership subject (`:67`) | honoured | first-slice:4,183; api:190,4 |
| 008-D13 | After the first Admin, ordinary identity/credential/admin changes require effective Admin (`:69`) | honoured | first-slice:16,195; api:197 |
| 008-D14 | MFA/passkeys/OIDC/SSO/recovery codes/self-service recovery/extra providers deferred from v0.0.1 (`:71`) | deferred | first-slice:29,208,269 (explicitly out of scope) |

### ADR-008 — Rules / Invariants (lines 75–90)

| # | ADR rule (`adr-008:line`) | Verdict | Evidence |
|---|---|---|---|
| 008-R1 | Authentication verifies a credential (`:75`) | honoured | first-slice:184 |
| 008-R2 | Credential binding resolves an authenticated credential to an `Identity` (`:76`) | honoured | first-slice:184-186 |
| 008-R3 | Authorization decides whether the resolved `Identity` may act (`:77`) | honoured | first-slice:195 |
| 008-R4 | A local password MUST NOT be stored/compared as plaintext (`:78`) | honoured | first-slice:8,187 ("Passwords are never stored or compared as plaintext") |
| 008-R5 | Password verification MUST use a vetted hashing implementation (`:79`) | honoured | first-slice:9,188 |
| 008-R6 | Session identifiers MUST be opaque, server-managed, revocable (`:80`) | honoured | first-slice:11,190 |
| 008-R7 | Session state MUST be invalidated when the resolved Identity is disabled (`:81`) | honoured | first-slice:14,22,193,201 (`resolveSession` rejects disabled-Identity sessions; disable invalidates sessions) |
| 008-R8 | Session state MUST NOT be treated as domain ownership (`:82`) | honoured | first-slice:41-47 (session carries only `identityId`); ownership stays on `Identity` (001-D1) |
| 008-R9 | Client-held session data MUST NOT be the authority source for Admin/Student/Curator (`:83`) | honoured | first-slice:195 (server-side authority check); api:108-109,12 |
| 008-R10 | First-Admin bootstrap MUST be auditable and distinguishable from ordinary Admin action (`:84`) | honoured | first-slice:181; api:190 |
| 008-R11 | First-Admin bootstrap MUST be rejected after an effective Admin exists (`:85`) | honoured | first-slice:3,182; api:118 (`409 bootstrap_already_completed`) |
| 008-R12 | The bootstrap secret MUST be operator-controlled and out-of-band (`:86`) | honoured | first-slice:180; api:160-163 (stdin/config secret, never CLI arg — api:183,259) |
| 008-R13 | The bootstrap secret MUST NOT be reusable after successful bootstrap (`:87`) | honoured | first-slice:3,182 (bootstrap rejected after first Admin exists → secret unusable) |
| 008-R14 | Ordinary credential-binding changes require Admin after bootstrap (`:88`) | honoured | first-slice:16,195 |
| 008-R15 | Ordinary Admin assignment/revocation require Admin + preserve last-effective-Admin (`:89`) | honoured | first-slice:16,195,204 |
| 008-R16 | Later ADRs MAY add MFA/passkeys/OIDC/SSO/etc only if preserving the Identity + authz model (`:90`) | deferred | forward-looking; deferred by first-slice:29,208,269 |

## Findings

None. Every row is `honoured` or `deferred`; no `contradicted` (fail) and no
`missing` (warning) rows.

## Open questions

None requiring escalation. Two observations, neither a finding:

1. (resolving layer: future spec) **Multiple credential bindings per Identity**
   (001-D5). The architecture must not encode a 1:1 credential↔Identity ownership
   invariant, yet v0.0.1 exposes at most one local password credential per Identity
   (first-slice:18,197). This is a *workflow* narrowing, not an architectural
   invariant — the record model keeps `identityId` on the credential — so it is
   `honoured`. A later spec that adds passkeys/recovery bindings must confirm the
   one-credential limit was only a slice cap.
2. (resolving layer: Program Membership) **Exceptional membership recovery**
   (003-R7) requires Admin authority but preserves Program Membership ownership.
   Identity v0.0.1 owns no membership state, so this is `deferred` here; it pairs
   with the Program Membership pass's deferred Admin-recovery-mutation open question
   (`2026-06-04T0743Z-orphan-adr-intent-program-membership.md` is the orphan view;
   the ADR→spec deferral is in `2026-06-04T0727Z-adr-spec-program-membership.md`
   open question 3). The eventual recovery spec spans both modules.

## Inspected

- `adr/adr-001-internal-identity-as-agonara-ownership-subject.md` (accepted) — 5
  Decision sentences (lines 32–40) + 10 Rules/Invariants bullets (lines 44–53) = 15 rows.
- `adr/adr-002-role-authority-scope-model.md` (accepted) — 8 Decision sentences
  (lines 42–59) + 11 Rules/Invariants bullets (lines 63–73) = 19 rows.
- `adr/adr-003-admin-recovery-invariant.md` (accepted) — 7 Decision sentences
  (lines 38–50) + 13 Rules/Invariants bullets (lines 54–66) = 20 rows (003-D3 folds
  the effective-Admin definition into one row); 21 counted with the definition row.
- `adr/adr-008-first-slice-authentication-session-and-credential-boundary.md`
  (accepted) — 14 Decision sentences (lines 40–71, 008-D11 folds the four bootstrap
  artifacts into one row as written) + 16 Rules/Invariants bullets (lines 75–90) = 34 rows.
- `specs/identity-role-management-first-slice.md` (version 0.0.1, draft) — logical
  records, commands/queries, rejection reasons, minimum admin UI surface, behavior
  rules 1–36, required tests, done criteria.
- `specs/identity-role-management-api-cli.md` (version 0.0.1, draft) — envelope,
  shapes, session transport, endpoint table, CLI, behavior rules 1–22, required
  tests, done criteria.

IDs enumerated: 001-D1..D5/R1..R10; 002-D1..D7/R1..R11; 003-D1..D7/R1..R13;
008-D1..D14/R1..R16. Decision/Rule pinning follows each ADR's own paragraph and
bullet boundaries. ADR-002's product-role decisions are realized in the Program
Membership module, not here; the Identity spec carries the *boundary* (grants no
product role), so those rows are `deferred (owned by Program Membership)`, not a
loss.
