# LAB-77: every YAML settings document holds exactly one YAML document

## Intent

Multica LAB-77. The shared `parseYAML`
(`agister/internal/domain/definition/yaml.go`) reads the first YAML
document of a file and ignores the rest, so a settings file with a second
document (`---`) drops it silently. LAB-59 made `blocks.yaml` require
exactly one document (`parseOneYAML`); the other YAML kinds still use
`parseYAML`: briefs, policies, processes, workflows, runtime mappings and
whatever else `documents.go` reads that way.

## Done when

1. Every YAML settings kind refuses a file with more than one document,
   with the problem `parseOneYAML` already gives ("must hold exactly one
   YAML document"), and keeps today's handling of an empty document.
   `parseYAML` either goes or is no longer used for settings.
2. A parser test per YAML kind, with a second document after a valid
   first one, asserts the refusal.
3. This repository's `.agister/`, the shipped examples
   (`agister/examples/`) and the home settings still pass `agister check`;
   the repository's tests that read them say the same.
4. The done gates: the caller skill (`agister/skills/agister/SKILL.md`),
   `agister/README.md`, `agister/docs/settings-architecture/` and
   `agister/pages/` say the same where they describe settings files. Say
   in the notes which needed no change and why.

## Out of scope

- TOML settings (`service.toml`) and other formats.

## Sources

- Multica LAB-77; LAB-59 and code_review `20261003T093630Z-b601a0`.
- `agister/internal/domain/definition/yaml.go`, `blocks.go`.

## Decisions

- 2026-10-07, owner: go on with the next issues; LAB-77 taken.

## Open

None.
