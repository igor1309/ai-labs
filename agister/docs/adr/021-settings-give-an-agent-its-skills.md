# ADR-021: Settings give an agent its skills

- **Status:** Accepted
- **Date:** 2026-10-05
- **Scope:** skills that Agister's settings own and name for an agent or a
  process, and how each runtime adapter gives them to a call
- **Decision type:** Architecture
- **Amends:** [ADR-006](006-a-call-gets-its-repository-instructions.md)
  (a call loads only what its runtime loads) and
  [ADR-011](011-pages-shows-the-skills-a-runtime-loads.md) rule 5 (an
  agent has no skills of its own)

## Context

A call loads the skills its runtime finds in the repository and the
user's home (ADR-006). Agister neither copies nor filters them, and an
agent has no skills setting (ADR-011). So Agister cannot give an agent
knowledge of its own: an implementer gets whatever skills happen to be in
the repository or in home. Agister's own knowledge reaches agents as
prompts (`prompts/`, ADR-014) or through a repository's `AGENTS.md`;
neither is loaded on demand, and neither is shared across runtimes as a
skill.

Every runtime has a way to take a skill from outside the repository and
the home, under the flags its adapter passes (observations in
[findings](../findings.md)):

- Claude Code takes a plugin folder for one session (`--plugin-dir`); a
  folder holding only `skills/<name>/SKILL.md` is enough, and its skills
  are named `<plugin>:<name>`.
- Pi takes a skill folder (`--skill`, repeatable).
- OpenCode takes skill folders from `skills.paths` in its inline
  configuration, under the call's `--pure`.
- Codex has no such option: it loads skills from `$CODEX_HOME/skills`,
  and keeps its threads under the same `CODEX_HOME`, so a thread resumes
  only with the home it ran in. The user's global `AGENTS.md` and
  `AGENTS.override.md` are read from there too.

Writing the skills into the call's checkout, where every runtime already
looks, was rejected (see Alternatives): it makes settings look like
repository content.

## Decision drivers

- A process's or an agent's skills reach its call on every adapter.
- A skill is a setting: found like a prompt, fixed and recorded with the
  call, and a missing one is a settings problem.
- The workspace is not touched: a patch, a verification and a setup
  (ADR-005, ADR-012) see what they see today.
- The skills a call loads from the repository and the home are loaded as
  before (ADR-006).
- A call that names no skill runs exactly as today.

## Decision

A skill is a settings document, `skills/<name>/SKILL.md`. An agent and a
process may name skills; their call gets them, frozen, from a folder
Agister makes outside the workspace, through each adapter's own way of
taking a skill.

## Rules

### 1. A skill is its `SKILL.md`

A skill is the folder `skills/<name>/` of a settings layer, holding one
file, `SKILL.md`. Its name follows the naming rule of every document, and
its front matter's `name` equals it and its `description` is not empty.
The project's skill replaces home's of the same name whole, as any
document does.

A skill folder holding anything else, or a `SKILL.md` that is not a
regular file, is a problem of that skill: a skill's other files are not
delivered, so a skill that relies on them would break unseen. Skills
with scripts or other files come with their own ADR.

### 2. An agent and a process name their skills

An agent names skills with `skills = ["<name>", ...]`, a process with
`skills: [<name>, ...]`. The call gets the process's skills and its
agent's, each once. With `--agent`, the process's skills stay and the
agent's are the named agent's. A name is literal, as a prompt's is
(ADR-014 rule 2).

### 3. Skills are resolved with the call and recorded

Each skill is read when the call is resolved, from the same settings
snapshot, and recorded among the call's definitions with its digest,
like the process and its prompts (ADR-014 rule 3). A workflow's node
gets the skills of its own call, from the workflow's snapshot.

### 4. A missing or broken skill is a problem of what names it

A name that exists in neither layer is a `check` problem of the agent or
process that names it, and a broken skill is a problem of its own;
either refuses only the calls that depend on it (ADR-015). `check
--tree` links an agent and a process to the skills they name. A skill is
not a kind `blocks.yaml` names (ADR-018 rule 1): a repository that does
not want it blocks what names it.

### 5. The call's skills are a folder outside the workspace

Before each turn, Agister writes the call's skills, from the recorded
bytes, into a folder of its own outside the workspace,
`<folder>/<name>/SKILL.md`, and replaces whatever the folder held. So
every turn starts with the skills that were recorded, whatever an
earlier turn did to the folder. The workspace, its patch, its
verification and its setup do not see the folder.

### 6. Each adapter gives the folder to its runtime

| Adapter | How the call gets its skills |
| --- | --- |
| `claude-code` | `--plugin-dir` of a generated plugin `agister` holding only the skills: each is `agister:<name>`, and nothing else of a plugin (hooks, agents, MCP servers) is there |
| `pi` | `--skill <folder>/<name>` for each skill |
| `opencode` | the folder in `skills.paths` of the inline configuration |
| `codex` | `CODEX_HOME` set to a home of the call's: links to the user's `auth.json`, `AGENTS.md` and `AGENTS.override.md` where they exist, and `skills/` holding a link to each entry of the user's `$CODEX_HOME/skills` beside the call's skills |

A Codex thread resumes only with the home it ran in, so the home is
chosen by the thread, not by the turn:

- A fresh thread whose call names skills gets a home of its own, kept as
  Pi's sessions are, named by the thread ID. A fresh thread whose call
  names none uses the user's `CODEX_HOME`, as today.
- A turn that resumes a thread uses the home that thread ran in, and the
  ccusage lookup runs with it. In a home of Agister's, the turn's skills
  replace what its `skills/` held of Agister's.
- A call that names skills and resumes a thread that ran in the user's
  `CODEX_HOME` is refused before its first turn: its skills cannot be
  given there.

The tool a call uses a skill with is the one each adapter already
requires (ADR-006, ADR-011 rule 2): Claude Code's Skill, Pi's read or
bash, OpenCode's skill, Codex's shell, whose sandbox reads outside the
workspace.

An adapter that cannot give skills refuses, before the first turn, a
call that names one.

### 7. Repository and home skills are loaded as before

The call's skills are added; the runtime still loads what ADR-006 says.
A call's skill and a repository's or home's skill of the same name are
both given; which one the runtime uses is the runtime's (ADR-011 rule 5).
Claude Code's names cannot meet: Agister's are `agister:<name>`.

## Amendments

- **ADR-006:** a call loads what its runtime loads from the repository
  and the home, unfiltered, and the skills its settings name (this ADR).
  "Agister does not copy" holds for the repository's and the home's
  skills.
- **ADR-011 rule 5:** an agent's skills are now two lists, shown apart:
  the skills its settings name (and, per process, the process's), each
  with its layer and its checks as in rule 7; and, as before, the skills
  its runtime would load from the repository and the home. Pages reads a
  settings layer's `skills/` folder as it reads any settings document
  (ADR-009 rule 1). The tab no longer says that Agister does not choose
  an agent's skills; editing is still not part of it.

## Consequences

- Knowledge kept in prompts can move into skills that settings give,
  whatever the repository holds.
- A call's skills are in its record, so what a call was given can be
  read afterwards, as its prompts can.
- A Codex thread whose call names skills runs with a home of Agister's:
  it is not in the user's `~/.codex`, and only a turn with that home
  resumes it. Besides what `--ignore-user-config` already leaves out,
  such a call misses the user's Codex memories and state, and whatever
  else Codex reads from its home that the links do not carry.
- A Codex run without skills cannot be continued by a call that names
  some; the settings change needs a fresh run.
- Each adapter gains a way to receive skills, and a test for each shows
  a call whose settings name a skill gets it.

## Alternatives considered

- **Write the skills into the call's checkout** (`.agents/skills`,
  `.claude/skills`), where every runtime looks. Rejected: the content
  identity stages every file, so the copies enter it unless every content
  check learns to leave them out; a call without a checkout would have to
  be moved; a created `.claude/skills` hides the main checkout's, which
  Claude Code falls back to; setup may link that folder to the owner's
  files; and the agent can edit the copies unseen.
- **A runtime home for every call and every adapter** (`CODEX_HOME`,
  `PI_CODING_AGENT_DIR`, OpenCode's configuration folder,
  `CLAUDE_CONFIG_DIR`). Rejected: three of the four take skills without
  it, and moving a runtime's home moves its sign-in, its sessions and
  its settings.
- **Give the skill's text in the instruction.** Rejected: that is a
  prompt (ADR-014), loaded whole every time, not a skill.

## Explicit non-decisions

Skills with files beside `SKILL.md`; `agister install` of skills
(ADR-016 rule 1 still reports them as not settings); skills that name
other skills; a skill that a repository's `blocks.yaml` names; whether a
runtime shows the model skills changed since a resumed session began;
protecting the folder from an agent during a turn, which the same user's
Bash can always reach.
