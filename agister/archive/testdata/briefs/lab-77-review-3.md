# LAB-77 review round 3: fixes

## Goal

`agister/testdata/briefs/lab-77-goal.md`

## Covers

- The Pages runtime inventory's one-document refusal, as the fix items
  below require.

## Acts on

The judgement of `code_review` workflow run `20261007T180826Z-aeb298`
(base `origin/trunk`), its three `fix` items, as written:

1. **`runtimeAdapters` rejects a multi-document home runtime before the same-name repository runtime replaces it** (1#1, 3#1, 5#1). In `runtimeAdapters` (agister/pages/skills.go), apply repository-over-home replacement before enforcing the one-document rule. Record each stem's parse error, clear it when a later layer replaces that stem, and refuse only errors in the file that wins. Add a test in agister/pages/skills_test.go: a multi-document home `main.yaml` and a valid repository `main.yml`/`main.yaml` must give HTTP 200 with the repository's adapter.
2. **No test covers the multi-document refusal on `/api/skills?path=~`** (2#1). Add a subcase to agister/pages/skills_test.go: put a multi-document runtime in the home settings, request `/api/skills?path=~`, and assert the same 422 status and the reported file and error.
3. **The Pages README's 'a runtime file with one is refused' can be read as refusing a valid one-document file** (4#1). Change the sentence to 'a runtime file with a second document is refused' or equivalent.

## Open

None.
