# Settings architecture: preparation notes

The facts behind `index.html` (top level) and `detailed.html`, each with
its source. Paths are relative to `agister/`. Checked against trunk at
8c148634 (2026-10-06).

## What settings are

- Agents, processes, policies, output contracts, permission mappings, the
  permission vocabulary and service limits are settings, changeable
  without rebuilding. Code adds only mechanisms settings cannot express:
  runtimes, input source kinds. (ADR-001 rule 2)
- The core owns what definitions mean; the store only supplies documents
  and their origin. (ADR-001 rule 2; `internal/adapters/fsdefs/fsdefs.go:414`)
- Agister runs settings; it does not judge whether they are right or safe.
  A project's settings override global ones unconditionally. (ADR-001,
  "runner, not a guard")

## Where they live: two layers

- **Home** (global): `$AGISTER_HOME`, else `~/.agister`, or `--home`.
  (`internal/cli/cli.go:88`, `:1283`) Home also holds live state that is
  not settings: `runs/`, `logs/`, `locks/`, `backups/`, and the runtimes'
  sessions (`codex/homes`, `pi/sessions`). (ADR-016 context;
  `cmd/agister/main.go` runtime wiring)
- **Repo** (project): `<git root>/.agister`. None outside a git repo,
  without that folder, or when it is home itself. A `.agister` that exists
  but cannot be used is an error, so project settings never silently stop
  applying. (`cmd/agister/main.go:336`)
- Agents cannot reach home; they can change a repo's `.agister` when they
  may write the repo. (ADR-001 rule 9)

## Document kinds and layout

Same layout in both layers (`internal/adapters/fsdefs/fsdefs.go:1`,
`:81`; `internal/domain/definition/definition.go:20`):

| Kind | File |
| --- | --- |
| service (singleton) | `service.toml` |
| agents | `agents/<name>.toml` |
| processes | `processes/<name>.yaml` |
| policies | `policies/<name>.yaml` |
| runtimes (adapter mappings) | `runtimes/<name>.yaml` |
| schemas (output contracts) | `schemas/<name>.json` |
| workflows | `workflows/<name>.yaml` |
| verifies | `verifies/<name>.yaml` (ADR-010) |
| prompts | `prompts/<name>.md` (ADR-014) |
| skills | `skills/<name>/SKILL.md`, the folder's only file (ADR-021) |
| workspace (singleton) | `workspace.yaml`, checkout setup (ADR-012) |
| blocks (singleton, repo only) | `blocks.yaml` (ADR-018) |

## How the layers combine

- A repo document replaces home's of the same kind and name, whole; no
  field merging. It records which home file it overrides. Listing is the
  union of both layers. (`internal/adapters/fsdefs/fsdefs.go:414-490`)
- A document missing from both names both expected paths.
  (`fsdefs.go:461`)
- Writes from the CLI (`init`, agent create) go to home.
  (`cmd/agister/main.go:281`)
- Reuse by name instead of copying: a global process names
  `verify:repo` and prompts by name, and each repo supplies its own
  `verifies/repo.yaml` or `prompts/<name>.md`. (ADR-010 rule 5, ADR-014)
  A prompt input may be optional; missing, it is left out and the record
  says so. (ADR-019)
- Limits only narrow: service ⊇ policy ⊇ process ⊇ caller; widening is
  rejected. (ADR-001 rule 3)
- A repo can block an agent, process, workflow or runtime mapping that
  home allows, with a reason; only the repo's `blocks.yaml` counts.
  (ADR-018)

## How a call uses them

- The call reads every document once into an in-memory snapshot, checks
  it, and uses exactly what it checked. (`internal/app/snapshot.go:58`,
  `internal/app/gate.go:187`, `internal/app/resolve.go:172`)
- The call's definitions, prompts, verification and skills are recorded
  with their digests. (ADR-010 rule 3, ADR-014 rule 3, ADR-021 rule 3)
- A call depends on the service, its process, and what that uses: agent,
  runtime mapping, policy, schema, verification, prompts, skills. A broken
  document refuses only the calls that depend on it, naming the chain.
  Only unattributable problems (service settings broken, an unreadable
  name, a name defined twice, a broken `blocks.yaml`) stop every command.
  (ADR-015, ADR-018 rule 5)
- Skills: the call's skills (its process's and its agent's) are written
  before each turn into a folder outside the workspace, from the recorded
  bytes, and handed to the runtime the adapter's way (Claude Code plugin
  dir, Pi `--skill`, OpenCode `skills.paths`, Codex a per-thread
  `CODEX_HOME`). The runtime still loads repo and home skills of its own
  as before. (ADR-021 rules 5-7, ADR-006)

## Installing a repo's settings into home

- `agister install <dir>` merges a settings folder into home document by
  document: plan (create / replace with diff / unchanged; home-only
  documents kept), check the result in a staged copy with this binary,
  ask yes, back up to `backups/<stamp>/` with a manifest, then write each
  file atomically. The yes binds the plan: changed meanwhile, it refuses.
  (ADR-016 rules 2-5)
- `install --restore <stamp>` undoes one install; the last five backups
  are kept. Install never deletes; restore deletes only what its install
  created. (ADR-016 rules 6-8)
- Install and restore run even when settings are broken. (ADR-016 rule 9)
- Not installed: live state, `blocks.yaml`, `skills/`.
  (`internal/adapters/fsdefs/install.go:91`; ADR-018 rule 6, ADR-021)

## Who reads settings

- The CLI and the core read them through the store, layered as above.
- `agister pages` reads settings files directly, not through the client
  contract, read-only, loopback only. (ADR-009) `GET /api/settings`
  returns the repo's files and home's files; the page composes the layers
  itself, the same rule as the core: repo over home by kind and name,
  marked `repo`, `home` or `repo, replaces home`. (`pages/serve.go:94`,
  `pages/page.js:85`, `pages/README.md`)
- `GET /api/skills` is pages' one source of skills: the skills the
  settings name (each with its layer and structure checks) and, apart, the
  skills each runtime would load from repo and home folders.
  (`pages/serve.go:116`, `pages/skills.go:573`; ADR-011 as amended by
  ADR-021; LAB-62, D-16)
