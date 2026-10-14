# LAB-228: settings checks its own types, and app maps the parsed documents to them

## Intent

This is the second inside-out step of LAB-188. How settings are kept, in files and their formats, belongs to the outer edges only (LAB-186). `internal/domain/definition` parses the settings files and is an edge. The core speaks its own types. LAB-225 did this for `enforce`, `run` and `policy`. Their callers, `internal/app/resolve.go` and `internal/domain/settings/bindings.go`, map the parser's types to them with `offer`, `ceilings` and `declared`.

`internal/domain/settings` checks a whole set of parsed settings documents for consistency. It takes them in the parser's types: `definition.Service`, `Agent`, `Process`, `Mapping`, `Workflow` and `Verification`. It needs only part of each. This step gives it its own types, and app maps the parsed documents to them.

## Done when

1. Which of a runtime's primitives are verified for a version is core logic. It lives on `enforce.Offer` and `enforce.Primitive`, not `definition.Mapping`. `enforce.Primitive` has `Verified`, and `internal/domain/enforce/versions.go` has `VerifiedFor`, `ForVersion`, `ForAnyVersion`, `Verified`, `WithVerified`, `Versions` and `UnknownPermissions`. These already exist, committed, with `versions_test.go`. `definition.Mapping` and `definition.Primitive` lose these methods, and `TestMappingVerification` in `internal/domain/definition/definition_test.go` loses what moved; it keeps what tests parsing. Every caller uses the offer, which `app`'s `offer` mapper builds, now including `Verified`.
2. `internal/domain/settings` imports no `internal/domain/definition`, in its code or its tests. `settings.Bundle` holds settings' own types, with only what the checks use:
   - `Service`: the `policy.Ceilings` and `StateReaching`.
   - `Agent`: `Name`, `Runtime`, `Effort`, `Skills`.
   - `Mapping`: `Name`, `Adapter`, `Efforts`, and its `enforce.Offer`.
   - `Process`: name, params, values, prompt, guidance, skills, the output schema it is validated against, its `policy.Declared`, and whether its session is resumable.
   - `Workflow`: name, values, call, fan-out and join nodes.

   A process comes to settings resolved, with its verification, as `Bundle.Resolved` resolves it today. `Verifies` and `Resolved` leave settings. The exported functions that take a parser type take settings' own types or plain values instead: `PlanProblems`, `ResumeProblems`, `CostProblems`, `SettingsPlan` and `WorkflowProblems`.
3. `internal/app` keeps the documents it parses in its own collection, in the parser's types. It maps them to `settings.Bundle` where it calls settings: in `check.go`, and in `resolve.go` for `WorkflowProblems` and `SettingsPlan`. The `offer`, `ceilings` and `declared` mappers exist once, in app. A probe that verifies primitives (`WithVerified`) is seen by the settings calls that follow, as it is today.
4. `internal/archtest/formats_test.go` loses the allow-list entry `internal/domain/settings imports internal/domain/definition`.
5. Behaviour is unchanged. Every problem message, the order of the problems, `agister check`'s report and the binding plans stay byte for byte as they are. The existing tests pass. They change only in how a package builds its input, and in the version tests moving to enforce.
6. `agister/scripts/test.sh` passes.

## Out of scope

- `internal/app` importing `definition` in general; later steps handle that. Only the mapping to settings, and the moved mapping methods, change in app.
- The settings reader and writer (LAB-226, LAB-227).
- The file field names in problem messages ("tools.allow", "stale.recover.max_resumes", "verify.max_attempts"). They stay as they are.

## Decisions

- 2026-10-12, the owner: inside-out. A core component gets its own types, and its callers map the file shape to them. Pairs of mappers collapse in later steps; there is no edge-first rewrite.

## Open

None.
