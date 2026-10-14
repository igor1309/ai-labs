# LAB-77 review round 2: fixes

## Goal

`agister/testdata/briefs/lab-77-goal.md`

## Covers

- The one-document rule on every surface that reads YAML settings, and the
  done gates, as the fix items below require.

## Acts on

The judgement of `code_review` workflow run `20261007T175306Z-ab00a5`
(base `origin/trunk`), its two `fix` items, as written:

1. **Pages `/api/skills` runtime inventory accepts a multi-document runtime YAML file** (1#1, 3#1). Make `runtimeAdapters` in agister/pages/skills.go enforce the same exact-one-document rule as `parseOneYAML` (strict single-document decoding instead of `yaml.Unmarshal`). Pass the refusal up through `skillsAt` so `/api/skills` refuses the file. Add a server-level `/api/skills` test: a runtime file with a valid first document followed by a second document must be refused.
2. **Pages README omits the YAML one-document rule; the notes wrongly say it needed no change** (1#2, 2#1, 4#1, 5#1). Add to the Settings section of agister/pages/README.md that every YAML settings file holds exactly one document and that a second document after `---` is refused with the stated problem. Update agister/docs/settings-architecture/notes.md to record that the Pages README was changed, not that it needed no change.

## Open

None.
