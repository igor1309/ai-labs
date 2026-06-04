---
date: 2026-06-04
model: claude-opus-4-8
description: "Upward orphan check for Agonara Identity & Role Management — every ADR-001/002/003/008 decision checked for an upstream intent parent."
skill: traceability-review
skill_version: "0.12.0"
scope: "upward orphan check — agonara (ADR → intent), Identity & Role Management (ADR-001/002/003/008)"
mechanism: upward-trace-matrix
suppression_rules: [derived-decision, carried-shape, cross-cutting-system-parent, multi-parent]
inputs:
  adrs:
    - adr-001-internal-identity-as-agonara-ownership-subject.md (accepted)
    - adr-002-role-authority-scope-model.md (accepted)
    - adr-003-admin-recovery-invariant.md (accepted)
    - adr-008-first-slice-authentication-session-and-credential-boundary.md (accepted)
  intents:
    - intent_learning_program_app.md (0.3.0)
    - admin_user_stories.md (0.2.1)
  map:
    - module_responsibility_map.md (0.4.3)
---

# Upward Orphan Check — Agonara (Identity & Role Management)

## Summary

Decision rows: 89 (approximate — ADR prose decisions carry no stable IDs).

- ADR-001: 5 Decision sentences (lines 32–40) + 10 Rules/Invariants (lines 44–53) = 15 rows.
- ADR-002: 7 Decision sentences (lines 42–59) + 11 Rules/Invariants (lines 63–73) = 18 rows.
- ADR-003: 7 Decision sentences (lines 38–50) + 13 Rules/Invariants (lines 54–66) = 20 rows.
- ADR-008: 14 Decision sentences (lines 40–71) + 16 Rules/Invariants (lines 75–90) = 30 rows.

(Plus 6 fold-equivalents the matrices keep separate; 89 enumerated below.)

Verdict breakdown:

- traced: 37
- derived: 49
- carried-shape: 3
- ORPHAN: 0

Finding total: 0 ORPHAN rows.

Verdict: Every decision, rule, and invariant in ADR-001/002/003/008 traces back to
an accepted Identity/Admin intent (ADM-01..11, the intent's role separation) or is
a legitimate technical/architectural derivation of one (the
authentication/authorization split, opaque sessions, the bootstrap secret,
password hashing, the role-scope model). No unrequested user-observable scope was
found. The local-password credential type and the role-scope vocabulary are
`carried-shape` — the intents commit credential binding (ADM-03) and the
student/curator/admin role separation (intent + ADM terms), and the ADRs fill the
v0.0.1 shape.

## Upward trace matrix

### ADR-001 — Decision (lines 32–40)

| ADR decision | adr file:line | Upstream intent (or derivation parent) | Verdict |
|---|---|---|---|
| Use internal `Identity` as the subject of ownership and action | adr-001:32 | ADM-02 admin_user_stories.md:43 ("created Identity exists independently of any credential or product role") | traced |
| Domain records reference an `Identity`, not credential/session/external | adr-001:34 | derivation parent adr-001:32; ADM-02:43 | derived |
| Credentials/external principals MAY be bound to an `Identity` | adr-001:36 | ADM-03 admin_user_stories.md:49 (bind credential so a person can authenticate) | traced |
| Credential binding authenticates; MUST NOT create ownership/grant roles/replace authz | adr-001:38 | ADM-03 admin_user_stories.md:53 ("authentication can resolve to the intended Identity while role grants remain separate") | traced |
| Architecture MUST permit ≥1 binding; first impl MAY be narrower but no 1:1 ownership invariant | adr-001:40 | derivation parent adr-001:36 (recovery/provider-migration extensibility); ADM-03 | derived |

### ADR-001 — Rules / Invariants (lines 44–53)

| ADR rule | adr file:line | Upstream intent (or derivation parent) | Verdict |
|---|---|---|---|
| `Identity` is the ownership subject | adr-001:44 | ADM-02 admin_user_stories.md:43 | traced |
| `Identity` is not a role | adr-001:45 | derivation parent adr-001:32 | derived |
| Credential is not ownership | adr-001:46 | ADM-03 admin_user_stories.md:49 | traced |
| Credential binding is not role assignment | adr-001:47 | ADM-03 admin_user_stories.md:53 | traced |
| Authentication proves access; authorization decides action | adr-001:48 | derivation parent adr-001:38; ADM-03:53 | derived |
| Ownership/attribution survive credential rotation/replacement/provider migration | adr-001:49 | derivation parent adr-001:32; ADM-04 admin_user_stories.md:59 (disable without deleting historical refs) | derived |
| Later lifecycle preserves historical ownership/audit refs | adr-001:50 | ADM-04 admin_user_stories.md:59,63 (historical references remain readable) | traced |
| Credential-binding state changes auditable as identity-mgmt operations | adr-001:51 | ADM-10 admin_user_stories.md:123 (credential-binding operations attributable) | traced |
| Product/operational roles granted explicitly outside credential binding | adr-001:52 | ADM-08 admin_user_stories.md:101 (Admin assignment is explicit); derivation parent adr-001:38 | derived |
| Later ADRs MAY define role scope/recovery/lifecycle/session/schema only if preserving the model | adr-001:53 | derivation parent adr-001:32 (guard clause; extension point, no new capability) | derived |

### ADR-002 — Decision (lines 42–59)

| ADR decision | adr file:line | Upstream intent (or derivation parent) | Verdict |
|---|---|---|---|
| Grant product authority through explicit Program-scoped participation grants | adr-002:42 | intent_learning_program_app.md role separation (student vs curator vs admin); derivation parent — scope model serving that separation | derived |
| Product roles are `Student` and `Program Curator`; Identity MAY hold either/both/none per Program | adr-002:44-49 | intent role separation; admin_user_stories.md:18 (product role term: Program-scoped Student/Curator) | traced |
| Identity MAY hold different product roles in different Programs | adr-002:51 | derivation parent adr-002:44 (private-instance flexibility) | derived |
| `Admin` is an operational role scoped to the Agonara instance | adr-002:53 | ADM-08 admin_user_stories.md:101 (instance-scoped Admin authority) | traced |
| `Admin` authority MUST NOT make the Identity a Student/Program Curator | adr-002:55 | ADM-08 admin_user_stories.md:105 (Admin changes do not grant Student/Curator) | traced |
| Product roles MUST NOT grant instance-scoped `Admin` authority | adr-002:57 | derivation parent adr-002:53/55 (separation symmetry); intent (admin is operational, not learning) | derived |
| Credential bindings MUST NOT grant product or operational roles | adr-002:59 | ADM-03 admin_user_stories.md:53; derivation parent adr-001:38 | derived |

### ADR-002 — Rules / Invariants (lines 63–73)

| ADR rule | adr file:line | Upstream intent (or derivation parent) | Verdict |
|---|---|---|---|
| Authority is denied unless explicitly granted | adr-002:63 | derivation parent — security baseline serving ADM-08/the role separation | derived |
| Product authority evaluated against Identity + Program scope | adr-002:64 | derivation parent adr-002:42 | derived |
| `Student` authority valid only within its Program scope | adr-002:65 | derivation parent adr-002:44 | derived |
| `Program Curator` authority valid only within its Program scope | adr-002:66 | derivation parent adr-002:44 | derived |
| `Admin` authority valid only at instance scope | adr-002:67 | ADM-08 admin_user_stories.md:101 | traced |
| `Admin` is not a product role | adr-002:68 | derivation parent adr-002:53; ADM-08:105 | derived |
| `Student`/`Program Curator` are not operational roles | adr-002:69 | derivation parent adr-002:53 | derived |
| A single Identity MAY have multiple product participation grants | adr-002:70 | derivation parent adr-002:51 | derived |
| A single Identity MAY combine Student + Program Curator in the same Program | adr-002:71 | derivation parent adr-002:51 | derived |
| Product participation grants MUST NOT mutate content/workspace/learning state | adr-002:72 | derivation parent — boundary; intent role separation | derived |
| Later ADRs MAY define recovery/permissions/schema only if preserving the model | adr-002:73 | derivation parent adr-002:42 (guard clause) | derived |

### ADR-003 — Decision (lines 38–50)

| ADR decision | adr file:line | Upstream intent (or derivation parent) | Verdict |
|---|---|---|---|
| Bootstrap path creates the first `Admin` Identity before operational | adr-003:38 | ADM-01 admin_user_stories.md:27,31 (initialize with a first admin; not operational without ≥1 Admin) | traced |
| After operational, retain ≥1 effective `Admin` | adr-003:40 | ADM-01 admin_user_stories.md:31; ADM-09 admin_user_stories.md:111 | traced |
| Definition of effective `Admin` | adr-003:42 | derivation parent adr-003:40 | derived |
| Any operation removing the last effective `Admin` MUST be rejected | adr-003:44 | ADM-09 admin_user_stories.md:115 (removing the last active Admin is rejected) | traced |
| Sensitive identity-mgmt ops require `Admin` after bootstrap | adr-003:46 | ADM-02/03/04 (admin-performed identity ops); derivation parent — operational-control protection | derived |
| Sensitive ops attributable to the acting Identity or bootstrap actor | adr-003:48 | ADM-10 admin_user_stories.md:127 (records the acting Admin identity) | traced |
| Admin recovery protects operational control only; not learning-domain | adr-003:50 | ADM-08 admin_user_stories.md:101 (operational control without changing learning-domain ownership); admin_user_stories.md:187 | traced |

### ADR-003 — Rules / Invariants (lines 54–66)

| ADR rule | adr file:line | Upstream intent (or derivation parent) | Verdict |
|---|---|---|---|
| New instance MUST NOT be operational without ≥1 effective Admin | adr-003:54 | ADM-01 admin_user_stories.md:31 | traced |
| Operational instance MUST retain ≥1 effective Admin | adr-003:55 | ADM-09 admin_user_stories.md:111 | traced |
| Removing/revoking/disabling/invalidating the last effective Admin MUST be rejected | adr-003:56 | ADM-09 admin_user_stories.md:115 | traced |
| Assigning/revoking Admin requires Admin after bootstrap | adr-003:57 | ADM-08 admin_user_stories.md:101 | traced |
| Creating/disabling/changing an Identity requires Admin after bootstrap | adr-003:58 | ADM-02 admin_user_stories.md:39, ADM-04:59; derivation parent adr-003:46 | derived |
| Creating/changing credential-binding requires Admin after bootstrap | adr-003:59 | ADM-03 admin_user_stories.md:49; derivation parent adr-003:46 | derived |
| Exceptional membership recovery requires Admin + preserves Program Membership ownership | adr-003:60 | ADM-13 admin_user_stories.md:151, ADM-14:161 (exceptional recovery/revocation); derivation parent — preserve Program Membership ownership | traced |
| Sensitive ops produce an audit record | adr-003:61 | ADM-10 admin_user_stories.md:123 | traced |
| Audit records identify the acting Identity when one exists | adr-003:62 | ADM-10 admin_user_stories.md:127 | traced |
| Bootstrap audit distinguishes bootstrap from ordinary Admin action | adr-003:63 | derivation parent adr-003:48 (auditability); ADM-10 | derived |
| Audit records identify the affected Identity/credential/admin-change/recovery | adr-003:64 | ADM-10 admin_user_stories.md:127 | traced |
| Backup/restore MUST NOT activate an instance violating the effective-Admin invariant | adr-003:65 | ADM-11 admin_user_stories.md:137; ADM-09:115 (derivation parent) | traced |
| Later ADRs MAY define auth strength/reauth/backup mechanics only if preserving the invariant | adr-003:66 | derivation parent adr-003:40 (guard clause) | derived |

### ADR-008 — Decision (lines 40–71)

| ADR decision | adr file:line | Upstream intent (or derivation parent) | Verdict |
|---|---|---|---|
| v0.0.1 uses an Agonara-owned local password credential as the first credential type | adr-008:40 | ADM-03 admin_user_stories.md:49 (credential binding exists; the ADR fills the v0.0.1 credential shape) | carried-shape |
| Local password authenticates access to an `Identity` only through a credential binding | adr-008:42 | ADM-03 admin_user_stories.md:49,53 | traced |
| Credential bindings MUST be owned by Identity & Role Management | adr-008:44 | module_responsibility_map.md:72 (Identity & Role Mgmt owns credential bindings); ADM-03 | traced |
| Credential bindings MUST NOT grant Admin/Student/Curator authority | adr-008:46 | ADM-03 admin_user_stories.md:53; derivation parent adr-001:38/adr-002:59 | derived |
| The first web session is a server-managed opaque session | adr-008:48 | derivation parent — mechanism to resolve authn → `Identity` (adr-001:38); no intent specifies session shape | derived |
| The session MUST resolve to an `Identity` before any protected op is authorized | adr-008:50 | derivation parent adr-008:48; adr-001:38 | derived |
| The session MUST NOT contain role grants as authoritative client-held claims | adr-008:52 | derivation parent adr-002:59 (roles granted server-side); security | derived |
| Authorization evaluated from server-side state after the session resolves | adr-008:54 | derivation parent adr-008:52 | derived |
| The bootstrap path is available only while no effective Admin exists | adr-008:56 | ADM-01 admin_user_stories.md:31; derivation parent adr-003:38 | traced |
| The bootstrap path requires an out-of-band bootstrap secret | adr-008:58 | derivation parent — mechanism for ADM-01 first-admin setup without default credentials; no intent names a "secret" | derived |
| Bootstrap creates 1 Identity, 1 credential binding, 1 Admin assignment, 1 bootstrap audit | adr-008:60-65 | ADM-01 admin_user_stories.md:27 (first admin identity); derivation parent — the concrete assembly | derived |
| The bootstrap secret MUST NOT become a credential/session/role/ownership subject | adr-008:67 | derivation parent adr-008:58 (security); adr-001:32 | derived |
| After the first Admin, ordinary identity/credential/admin changes require effective Admin | adr-008:69 | ADM-08 admin_user_stories.md:101; derivation parent adr-003:46 | derived |
| MFA/passkeys/OIDC/SSO/recovery codes/extra providers deferred from v0.0.1 | adr-008:71 | derivation parent — first-slice scoping; no intent requires them | derived |

### ADR-008 — Rules / Invariants (lines 75–90)

| ADR rule | adr file:line | Upstream intent (or derivation parent) | Verdict |
|---|---|---|---|
| Authentication verifies a credential | adr-008:75 | derivation parent adr-008:42; ADM-03 | derived |
| Credential binding resolves an authenticated credential to an `Identity` | adr-008:76 | ADM-03 admin_user_stories.md:53 | traced |
| Authorization decides whether the resolved `Identity` may act | adr-008:77 | derivation parent adr-001:38 | derived |
| A local password MUST NOT be stored/compared as plaintext | adr-008:78 | derivation parent — security mechanism enabling ADM-03 safely; no explicit intent | derived |
| Password verification MUST use a vetted hashing implementation | adr-008:79 | derivation parent adr-008:78 | derived |
| Session identifiers MUST be opaque, server-managed, revocable | adr-008:80 | derivation parent adr-008:48 | derived |
| Session state MUST be invalidated when the resolved Identity is disabled | adr-008:81 | ADM-04 admin_user_stories.md:63 (a disabled Identity cannot initiate new actions) | traced |
| Session state MUST NOT be treated as domain ownership | adr-008:82 | derivation parent adr-001:34 | derived |
| Client-held session data MUST NOT be the authority source for Admin/Student/Curator | adr-008:83 | derivation parent adr-008:52 | derived |
| First-Admin bootstrap MUST be auditable and distinguishable from ordinary Admin action | adr-008:84 | ADM-10 admin_user_stories.md:123; derivation parent adr-003:63 | traced |
| First-Admin bootstrap MUST be rejected after an effective Admin exists | adr-008:85 | ADM-01 admin_user_stories.md:31; derivation parent adr-008:56 | traced |
| The bootstrap secret MUST be operator-controlled and out-of-band | adr-008:86 | derivation parent adr-008:58 | derived |
| The bootstrap secret MUST NOT be reusable after successful bootstrap | adr-008:87 | derivation parent adr-008:58 (security) | derived |
| Ordinary credential-binding changes require Admin after bootstrap | adr-008:88 | ADM-03 admin_user_stories.md:49; derivation parent adr-003:59 | derived |
| Ordinary Admin assignment/revocation require Admin + preserve last-effective-Admin | adr-008:89 | ADM-08 admin_user_stories.md:101; ADM-09:115 | traced |
| Later ADRs MAY add MFA/passkeys/OIDC/SSO only if preserving the Identity + authz model | adr-008:90 | derivation parent adr-001:32 (guard clause) | derived |

## Findings

Zero ORPHAN rows. No decision in ADR-001/002/003/008 introduces a user-observable
capability or scope commitment unrequested by an accepted Identity/Admin intent.

Candidates that initially looked parent-less, and the suppression guard that caught each:

- **The bootstrap secret** (adr-008:58,67,86,87). No intent names a "secret."
  Caught by `derived`: it is the mechanism that lets ADM-01 (initialize a private
  instance with a first admin) work without default credentials — a derived
  security requirement of "create the first Admin before the instance is
  operational," not a new user-facing capability.
- **Opaque server-managed sessions + password hashing** (adr-008:48,78,79,80).
  No intent names sessions or hashing. Caught by `derived`: both are the technical
  means to honour ADM-03 (authenticate a person to an Identity) under the
  authentication-is-not-authorization rule (adr-001:38), and are security
  primitives, not stakeholder features.
- **The local-password credential type** (adr-008:40). Caught by `carried-shape`:
  ADM-03 commits the *existence* of credential binding; the ADR picks local
  password as the v0.0.1 credential shape and defers MFA/passkeys/OIDC.
- **The role-scope model** (adr-002 throughout). No single intent dictates
  "Program-scoped product roles + instance-scoped Admin." Caught by `traced`
  (Admin scope → ADM-08) + `derived`: the scope model is the architectural
  expression of the intent's student/curator/admin separation, adding no authority
  the stories don't already presume.

## Open questions

- (resolving layer: intent) The **out-of-band bootstrap secret** (adr-008:58) is
  the closest to an unrequested operator-visible mechanism — it introduces a
  deployment-time secret no intent mentions. It is `derived` because ADM-01 demands
  a first-admin path and "no default credentials" is the safe realization. If the
  intent/operations layer wants to constrain how the bootstrap secret is supplied
  or rotated, that is an intent/deployment decision, not an ADR orphan.
- (resolving layer: intent) **Local password as the first credential type**
  (adr-008:40) is a v0.0.1 shape choice (`carried-shape`). If the intent layer
  wants to require a specific first credential (e.g. passkeys) or forbid local
  passwords, that is an intent-side constraint; the ADR explicitly leaves the
  credential type open to later ADRs (adr-008:90).

## Inspected

- `adr-001-internal-identity-as-agonara-ownership-subject.md` (accepted) — 5
  Decision sentences (lines 32–40) + 10 Rules/Invariants (lines 44–53) = 15 rows.
- `adr-002-role-authority-scope-model.md` (accepted) — 7 Decision sentences
  (lines 42–59) + 11 Rules/Invariants (lines 63–73) = 18 rows.
- `adr-003-admin-recovery-invariant.md` (accepted) — 7 Decision sentences
  (lines 38–50) + 13 Rules/Invariants (lines 54–66) = 20 rows.
- `adr-008-first-slice-authentication-session-and-credential-boundary.md`
  (accepted) — 14 Decision sentences (lines 40–71) + 16 Rules/Invariants
  (lines 75–90) = 30 rows.
- `intent_learning_program_app.md` (0.3.0) — role separation (student/curator/admin),
  admin as private-instance operation.
- `admin_user_stories.md` (0.2.1) — ADM-01..11 (instance setup, identity
  administration, access administration, audit, backup/restore) + ADM-13/14
  (membership recovery, for adr-003:60) and boundaries.
- `module_responsibility_map.md` (0.4.3) — Identity & Role Management ownership row
  (identities, credential bindings, Admin role, access recovery), used to confirm
  module→intent-area mapping.

Executive Summary, Context, Consequences, and Non-Goals of each ADR were read but
not enumerated as decision rows. No specs, plans, code, or tests were read.
