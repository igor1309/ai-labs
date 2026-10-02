# ADR-010: Pages shows the skills a runtime loads

- **Status:** Accepted
- **Date:** 2026-10-02
- **Scope:** `agister pages`: the Knowledge tab, which shows each agent's
  runtime, model, effort and skills
- **Decision type:** Architecture
- **Amends:** [ADR-009](009-pages-reads-settings-and-runs-directly.md)
  rule 1

## Context

ADR-009 lets `agister pages` read settings files and run records, and
nothing else. The owner wants a Knowledge tab in it that shows, per agent,
the skills it works with (decisions D-1 and D-2 in
[decisions.md](../decisions.md)). By
[ADR-006](006-a-call-gets-its-repository-instructions.md) a call loads
whatever skills its runtime loads in the repository and the user's home;
Agister neither copies nor filters them, and an agent has no skills
setting. So an agent's skills are the skills its runtime would load, and
showing them means reading skill files: the folders each runtime loads
from. Which folders those are was checked against each runtime's
documentation, its installed CLI and the adapter's flags
([findings](../findings.md), 2026-10-02).

A call runs in the repository's root, or in a checkout of a revision of it
(`workspace.checkout`), so the folders that matter are the root's and the
home's.

## Decision

1. `agister pages` may read skill files, read-only, besides settings files
   and run records: the skill folders below, of the runtime adapters the
   shown settings use, in the shown repo and in the user's home. It reads
   nothing else of a skill folder than this ADR says.
2. The folders it reads, per adapter:

   | Adapter | Repo | Home |
   | --- | --- | --- |
   | `claude-code` | `.claude/skills` | `~/.claude/skills`, its `synced/` included |
   | `codex` | `.agents/skills`, `.codex/skills` | `~/.agents/skills`, `$CODEX_HOME/skills` (default `~/.codex/skills`), its `.system/` included |
   | `pi` | `.agents/skills`, `.pi/skills` | `~/.agents/skills`, `$PI_CODING_AGENT_DIR/skills` (default `~/.pi/agent/skills`) |
   | `opencode` | `.agents/skills`, `.claude/skills`, `.opencode/skills` | `~/.agents/skills`, `~/.claude/skills`, `~/.config/opencode/skills` |

   - `claude-code`: the adapter passes no setting-sources, bare or safe
     mode, so Claude Code loads the user's and the project's skills and
     offers the Skill tool on every turn.
   - `codex`: the adapter passes `--ignore-user-config`, so Codex reads no
     `config.toml`: its `[[skills.config]]` switches do not apply, and
     plugin skills were not loaded. The skill folders still are, including
     the repo's `.codex/skills`, which Codex's skills page does not name.
   - `pi`: the adapter never passes `--no-skills` and passes `--approve`,
     which trusts the project, so Pi loads the project folders. The adapter
     refuses a turn granted neither `read` nor `bash`, without which Pi
     leaves skills out, so every Pi call loads them. `~/.pi/agent/skills` is in
     Pi's documentation and code; it was not observed.
   - `opencode`: the folders are the ones `opencode debug skill` listed,
     with `.opencode/skills` from OpenCode's documentation. That command
     runs without the call's `--pure` and inline configuration; that
     those change no skill folder was not checked.
3. It does not read what a runtime loads from elsewhere, and the tab says
   for each runtime that the list leaves these out:
   - skills built into a runtime, and plugin or package skills: their
     place is the runtime's install and plugin state, not a skill folder
     of the repo or the home;
   - Claude Code's managed-settings skills and Codex's `/etc/codex/skills`:
     neither repo nor home;
   - Claude Code's `.claude/commands/` files: they are commands, not skill
     folders;
   - skills in a `.claude/skills` below the repo's root, which Claude Code
     loads once it works on files there;
   - Pi's skill paths and package skills named in its settings files, and
     their switches, which pages does not evaluate.
4. It shows the repo's working tree. A call on a checkout loads what that
   checkout holds: the revision's committed skills, which can differ.
   Claude Code (2.1.287) loads the main checkout's `.claude/skills` when
   the checkout has none at its root. For `~` (Agister home, no repo) the
   tab shows the home folders only. Home folders are resolved from pages'
   own environment; a call started with another `HOME`, `CODEX_HOME` or
   `PI_CODING_AGENT_DIR` loads other folders, so the tab names each folder
   it read.
5. For an agent the tab shows its runtime adapter, model and effort, from
   the settings, and the skills its runtime would load, each with where it
   comes from: repo or home, and the folder. There is no assignment: the
   tab says that Agister does not choose an agent's skills (ADR-006) and
   that editing is not part of it. Skills of the same name in several
   folders are all shown and the shared name is marked; the tab does not
   decide which one a runtime uses.
6. Observed usage is shown apart from that list and labelled as observed:
   the skills seen in the agent's run events, counted as pages already
   counts them, with the number of runs they come from. A skill with no
   observed use shows nothing about use: no usage evidence is never shown
   as "unused".
7. Pages checks each skill's structure only: its `SKILL.md` is there, is a
   file within the size limit, and its front matter parses; `name` and
   `description` are there and not empty; `name` equals the skill
   folder's name. The result is labelled "checks passed" or "checks
   failed" with the failed checks named, never as reviewed, approved or
   safe. A failed check is not a statement that the runtime refuses the
   skill: Claude Code takes the folder's name when `name` is missing, and
   Pi does not require the two to match.
8. Agent review and owner review of a skill are not part of this ADR. An
   agent review is a call, and pages submits nothing; an owner review is a
   record to write, and pages writes nothing. Each comes later, with its
   own ADR; so does editing from the page (D-1).
9. Bounds:
   - No request names a file. The page asks for a repo, as an absolute
     path or `~` as for settings, and pages derives the folders from the
     table above itself.
   - It reads `SKILL.md` files only, each at most the settings endpoint's
     size limit (256 KB); a larger one is shown as too large, not read,
     and its checks are not run. A skill's other files are not read.
   - Symlinks: a skill folder and each skill entry in it are resolved to
     their real path, as the runtimes follow them, and the page shows the
     real path beside the link. A `SKILL.md` is read only when its real
     path lies inside its skill entry's real path; otherwise it is shown
     as outside its skill and not read. A link that does not resolve, or
     loops, is shown as broken. Below a skill folder's top level, a
     symlinked directory is not followed, so a skill reached only through
     one is not listed.
   - Loopback and Host rules are those of ADR-009, unchanged.

## Amendments to ADR-009

- Rule 1: pages reads settings files, run records and the skill files of
  this ADR's rules, directly, and does not use the client contract.
- Rules 2 to 4 are unchanged: pages only reads, submits and changes
  nothing, and serves on loopback only.

## Consequences

- The owner sees, per agent, what its runtime would load, where it comes
  from, and apart from it what its runs used, without an assignment
  concept that ADR-006 does not have.
- The folders are what the runtimes did at the versions in the findings.
  A runtime that changes where it loads skills makes the list wrong until
  this ADR's table follows it.
- Skill review and editing need their own ADRs before the page can do
  either.

## Limitation

The tab lists skill folders, not the runtime's own view of them: what
rule 3 leaves out is named, not shown, and a runtime's choice between
skills of the same name is not reproduced.
