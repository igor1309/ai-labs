# Pre-implementation investigation: what existing solutions do

How existing coding agents and orchestrators handle the work of
understanding a codebase before changing it, and what they hand to the
implementer. Collected on 2026-10-08 for Multica LAB-127, which feeds
LAB-126 (ground the investigator role). What the owner decided from it,
and the proposals that are still draft, are in
[`investigator-draft.md`](investigator-draft.md).

## Summary

The solutions split into three families, and the field has been moving from the first to the third:

- **Standing repository documentation** written once and loaded every time (BMAD v4 `document-project`, Cline Memory Bank, OpenHands `repo.md`, `AGENTS.md` / `CLAUDE.md`).
- **Computed context** regenerated on every request, never stored (Aider repo map).
- **Per-task investigation** in an isolated context that returns a compact, task-scoped result (Claude Code Explore / Plan, Roo Orchestrator, HumanLayer research → plan → implement, Spec Kit `research.md`).

Two findings matter most for our investigator:

1. **BMAD has reversed its own position.** `bmad-document-project` and `bmad-generate-project-context` are now deprecated. Their replacement writes a small verified block into `AGENTS.md` and explicitly excludes repo overviews, directory trees and tech-stack lists, because "agents read code better than prose about code, and the copy goes stale."
2. **Independent measurement agrees.** The ETH Zurich study of `AGENTS.md`-style files found they do not generally improve task success and raise inference cost by over 20%; repository overviews in particular did not help. They remain useful for non-standard practices an agent cannot infer.

So the evidence favours an investigator that produces a **task-scoped, commit-pinned brief of facts with file references**, plus a very small standing file reserved for things that cannot be read from code.

Limits of this research: Grok Build has little public material on this topic (details below). MetaGPT, CrewAI and LangGraph are covered briefly because they do not really have a codebase-investigation step. Everything below comes from the linked docs; "reported in practice" rows rely on vendor write-ups and secondary articles, not on our own trials.

## 1. Per-solution summary

### BMAD-METHOD

- **v4 (historical).** The architect agent ran `*document-project` and produced one comprehensive brownfield architecture document in `docs/`, describing the system as it really is, including undocumented patterns and technical debt. Two entry orders: *document-first* (document everything, then write the PRD) for small or unknown systems, and *PRD-first* (PM scopes the change, architect documents only the affected modules) for large ones. Documents were then "sharded" into smaller files that story creation and the dev agent referenced. [Working in the brownfield (v4)](https://cdn.jsdelivr.net/npm/@cloudkinetix/bmad-enhanced@1.27.0/bmad-core/working-in-the-brownfield.md)
- **v6 interim.** `bmad-generate-project-context` produced `_bmad-output/project-context.md` with stack versions, patterns and implementation rules, loaded by implementation workflows.
- **Current.** Both skills are deprecated and forward to `bmad-project-context`, which writes a block between `<!-- bmad:context -->` markers in the repo's `AGENTS.md`. It is skipped entirely if the repo already maintains `AGENTS.md` / `CLAUDE.md`. The block "holds only what is expensive to rediscover, or that the agent learns only after it has already gone wrong." Maintenance has three intents: **refresh** (re-check caveats, diff deletions and renames since the recorded commit), **record** (a pitfall goes in only when someone has seen the mistake), **audit** (re-check and cut; "the block ends smaller or equal, never larger"). The guidance is to let the agent investigate the code during the build. [Start in an existing codebase](https://docs.bmad-method.org/existing-codebases/start-in-an-existing-codebase/), [Set and maintain project context](https://docs.bmad-method.org/existing-codebases/set-and-maintain-project-context/)

### Grok Build (xAI)

Terminal coding agent, early beta since 25 May 2026. What the official docs confirm:

- **Plan mode**: "only the session plan file can be edited until you approve"; entered with `/plan` or `Shift+Tab`, viewed with `/view-plan`.
- Subagents exist ("workflows orchestrate a bounded set of subagents in the background"), but no subagent types are documented, and no dedicated explore or research role is named.
- Cross-session memory: `/memory` and `/dream` (consolidation).
- `grok inspect` shows discovered config sources, instructions, skills, plugins, hooks and MCP servers.

Sources: [Modes and commands](https://docs.x.ai/build/modes-and-commands), [Build overview](https://docs.x.ai/build/overview). Third-party reviews add that `AGENTS.md` is auto-discovered and that subagents run in isolated git worktrees for research, implementation and review ([Mervin Praison's write-up](https://mer.vin/2026/05/grok-build-cli-xai-terminal-coding-agent-with-plan-mode-subagents-and-headless-ci/)).

**Not established:** the format or storage location of the plan file, what an investigation hand-off looks like, any codebase indexing, and how memory is kept fresh. The product page `x.ai/build` refused the fetch (HTTP 403), so I did not read it. I have not filled these gaps.

### Claude Code

- **Explore**: built-in read-only subagent (Write and Edit denied) that the main agent delegates to when it needs to search or understand code. The caller picks a thoroughness level: quick, medium, very thorough. Only a summary returns; the raw exploration stays in the subagent's context.
- **Plan**: read-only research subagent used in plan mode to gather context before a plan is presented for approval.
- Both skip `CLAUDE.md` and the git status snapshot to stay fast and cheap, so repository instructions reach the implementer but not the explorer.
- Standing context is `CLAUDE.md`, loaded each session. Custom subagents can also keep persistent memory (`memory: project` → `.claude/agent-memory/<name>/MEMORY.md`, first 200 lines or 25 KB injected) to accumulate "codepaths, patterns, library locations, and key architectural decisions."

Source: [Subagents documentation](https://code.claude.com/docs/en/sub-agents)

### Codex (`AGENTS.md`)

No separate investigation role in the documented flow; orientation is by instruction files. Codex builds an instruction chain on every run: `~/.codex/AGENTS.override.md` or `~/.codex/AGENTS.md`, then every level from git root to the working directory, concatenated root-down so nearer files win. The total is capped at `project_doc_max_bytes` (32 KiB by default). Freshness is purely the authors' responsibility. [AGENTS.md guide](https://learn.chatgpt.com/docs/agent-configuration/agents-md)

### OpenHands

No investigation role; a standing file plus a bootstrap script. `.openhands/microagents/repo.md` is given to the agent every time and is meant to hold the repository overview, directory structure, development guidelines, testing requirements and setup. Keyword-triggered knowledge files in `.openhands/microagents/knowledge/` load only when relevant. `.openhands/setup.sh` runs at the start of each session. [Repository customization](https://docs.all-hands.dev/modules/usage/customization/repository), [Microagents overview](https://docs.all-hands.dev/modules/usage/prompting/microagents-overview)

### Aider (repo map)

No agent and no document: the "investigation" is an algorithm. Aider parses the repository with tree-sitter and builds a map of files with their most important classes and functions, including signatures. A graph-ranking algorithm (files as nodes, dependencies as edges) selects the parts most relevant to the current chat, fitted to a token budget (`--map-tokens`, default 1k, expanded when needed). The map is sent with each change request, so it cannot be stale. It covers structure and dependencies well, and says nothing about intent, conventions or constraints. [Repository map](https://aider.chat/docs/repomap.html)

### Cline (Memory Bank) and Roo Code (Architect / Orchestrator)

- **Cline Memory Bank**: six markdown files in `memory-bank/` — `projectbrief.md`, `productContext.md`, `activeContext.md`, `systemPatterns.md` (architecture, patterns, component relationships), `techContext.md` (stack, setup, constraints), `progress.md`. All are read "at the start of EVERY task"; updated after significant changes or on the "update memory bank" command. The docs themselves state the weakness: "my effectiveness depends entirely on its accuracy." [Cline Memory Bank](https://docs.cline.bot/prompting/cline-memory-bank)
- **Roo Code**: the Orchestrator delegates subtasks to modes such as Architect or Code via `new_task`. Each subtask has an isolated context; information goes down only through the initial instructions and up only through the completion summary, which is "the source of truth used to keep track of what was completed." The Orchestrator deliberately cannot read files or run commands, to keep its context clean. [Boomerang tasks](https://roocodeinc.github.io/Roo-Code/features/boomerang-tasks)

### GitHub Spec Kit

Investigation is Phase 0 of `/speckit.plan`. It resolves every "NEEDS CLARIFICATION" item into `research.md` as Decision / Rationale / Alternatives considered; unresolved items are an error. Phase 1 then produces `data-model.md`, `contracts/` and `quickstart.md` (runnable validation scenarios). A project constitution (`.specify/memory/constitution.md`) gates the plan before and after design. The research is about decisions for the new feature more than about the existing code; brownfield onboarding is left to community extensions. [plan command template](https://raw.githubusercontent.com/github/spec-kit/main/templates/commands/plan.md), [brownfield bootstrap issue](https://github.com/github/spec-kit/issues/1436)

### Agent OS (Builder Methods)

`/discover-standards` extracts conventions from the codebase: it suggests 3–5 focus areas, reads 5–10 representative files per area looking for patterns that are unusual, opinionated and consistent, asks the human *why* each exists, then drafts short standards. Output is one markdown file per domain in `agent-os/standards/` plus `index.yml` with one-line descriptions, so an agent can select relevant standards without reading them all. Advice: lead with the rule, include a code example, omit what the framework makes obvious. `/index-standards` re-syncs the index; the standards' own accuracy is not checked. [Discover standards](https://buildermethods.com/agent-os/discover-standards)

### HumanLayer research → plan → implement

Not on the issue's list, but the closest existing match to our investigator role, and widely copied.

- `research_codebase` is a command that fans out read-only subagents with narrow roles: **codebase-locator** (where code lives), **codebase-analyzer** (how it works, with `file:line`), **codebase-pattern-finder** (existing patterns to follow).
- Hard rule: "your only job is to document and explain the codebase as it exists today" — no critique, no recommendations.
- Output: `thoughts/shared/research/YYYY-MM-DD-<ticket>-<topic>.md` with frontmatter `date`, `git_commit`, `branch`, `repository`, `topic`, `status`, `last_updated`. Sections: Research Question, Summary, Detailed Findings, Code References, Architecture Documentation, Historical Context, Open Questions. Follow-ups are appended as dated sections.
- The plan step reads the research file; the implementer reads the plan.
- Rationale: "a bad line of research could land you with thousands of bad lines of code", so human review is concentrated on research and plan. Reported results include a fix in a 300k-line Rust codebase the author did not know, and a failure where two weeks went into rabbit holes on a race condition. HumanLayer later split the workflow into smaller stages because single large prompts (85+ instructions) were unreliable.

Sources: [research_codebase command](https://raw.githubusercontent.com/humanlayer/humanlayer/main/.claude/commands/research_codebase.md), [Advanced context engineering for coding agents](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/ace-fca.md), [ZenML summary of the later revision](https://www.zenml.io/llmops-database/evolving-ai-coding-agent-workflows-from-research-plan-implement-to-crispy)

### MetaGPT, CrewAI, LangGraph

- **MetaGPT**: roles (product manager, architect, project manager, engineer) pass standardized documents. Incremental mode (`--project-path`) re-reads and regenerates its *own* earlier artifacts in `docs/prds`, `docs/system_designs`, `docs/tasks`, `docs/code_summaries`. It does not investigate a codebase it did not generate, and it states it cannot take architecture-level or function-level requirements. [Incremental development](https://docs.deepwisdom.ai/main/en/guide/in_depth_guides/incremental_development.html)
- **CrewAI**: a general framework. `planning=True` runs an AgentPlanner before each iteration and appends the plan to every task description; task `context` passes one task's output to another. Nothing specific to codebases. [Planning](https://docs.crewai.com/en/concepts/planning)
- **LangGraph**: a graph runtime, not a method. Open SWE, built on it, describes a "plan and investigate" step before implementing in a sandbox and recommends "subagents for research and independent work", with context carried in thread state. Its README gives no hand-off format. [Open SWE](https://github.com/langchain-ai/open-swe)

## 2. Comparison

| Solution | Separate role or phase? Trigger | Output and storage | Lifetime | Modules / patterns / dependencies | Hand-off to implementer | Staleness control |
|---|---|---|---|---|---|---|
| BMAD v4 | Yes: architect, `*document-project`, run by the user | Whole-system architecture doc in `docs/`, sharded | Standing | Prose: patterns, integration points, tech debt | Stories and dev agent reference shards | None; re-run manually |
| BMAD current | Maintenance skill, not a phase; investigation happens inside the build | Small block in `AGENTS.md` | Standing, shrinking | Deliberately excluded; only policy and observed pitfalls | Auto-loaded instruction file | Refresh diffs against recorded commit; audit only cuts |
| Grok Build | Plan mode (phase); subagent roles undocumented | Session plan file; format not documented | Session | Not documented | Approved plan | Not documented |
| Claude Code | Yes: Explore and Plan subagents, delegated automatically | Summary message; nothing stored | One task | Whatever the delegating prompt asks | Summary returned into the caller's context | Fresh every time |
| Codex | No | `AGENTS.md` chain, 32 KiB cap | Standing | Whatever authors wrote | Auto-loaded | Manual |
| OpenHands | No | `repo.md`, keyword-triggered knowledge files, `setup.sh` | Standing | Overview and directory structure in prose | Auto-loaded; knowledge on keyword | Manual |
| Aider | No agent; algorithm on each request | Ranked symbol map in the prompt, not stored | One request | Strong on structure and dependencies; nothing on conventions | Included in the prompt | Recomputed, cannot go stale |
| Cline Memory Bank | No; the same agent maintains it | Six files in `memory-bank/` | Standing | `systemPatterns.md`, `techContext.md` | All files read at every task start | Manual "update memory bank" |
| Roo Code | Yes: Architect mode as an isolated subtask of the Orchestrator | Completion summary | One task | Whatever the instructions ask | Summary passed into the next subtask's instructions | Fresh every time |
| Spec Kit | Phase 0 of `/speckit.plan` | `research.md` (Decision / Rationale / Alternatives) in the feature's spec folder | One feature | Weak on existing code; strong on decisions | Files read by tasks and implement steps | Scoped to the feature branch |
| Agent OS | Separate command, run by the user | `agent-os/standards/*.md` + `index.yml` | Standing | Conventions only, with rationale | Selected standards injected via the index | Index re-sync only |
| HumanLayer RPI | Yes: research command with locator / analyzer / pattern-finder subagents | Research doc with `git_commit` frontmatter and `file:line` references | One task, kept as history | Explicit sections for locations, behaviour and patterns | Plan reads the research; implementer reads the plan | Pinned to a commit; dated follow-ups appended |
| MetaGPT | Roles, but for generating new projects | PRD, system design, task docs | Standing, self-generated | Class and sequence diagrams of its own design | Documents between roles | Regenerated per iteration |
| CrewAI | Optional planner step | Plan appended to task descriptions | One run | None | Task description and `context` | n/a |

## 3. Practices for our investigator

### Worth adopting

- **Investigate per task, in an isolated read-only context, and return a compact brief.** Claude Code, Roo and HumanLayer all converge on this; it keeps search noise out of the implementer's context, and a task-scoped result has nothing to go stale.
- **Describe what exists; do not propose.** HumanLayer's "document the codebase as it exists today" rule keeps the investigator's output checkable and stops it from pre-empting the planner or implementer.
- **Tie every claim to `path:line` and pin the brief to a commit and branch.** This makes the brief verifiable and gives a mechanical staleness test: have the referenced files changed since that commit? BMAD's refresh uses the same idea. It also fits Agister's deterministic verification.
- **Split investigation into narrow questions**: where the code lives, how it works, which existing pattern to copy. These are the HumanLayer subagent roles, and they map directly onto the parent issue's list (modules, patterns, responsible components, dependencies).
- **Scope before depth.** BMAD v4's PRD-first order — define the change, then document only the affected modules — was its own recommendation for large codebases. Give the investigator the change request, not "document the repo".
- **Let the caller set depth** (Claude Code's quick / medium / very thorough), so small changes do not pay for a full investigation.
- **End with explicit open questions, and treat unresolved ones as a gate.** Spec Kit's "NEEDS CLARIFICATION must resolve" turns a vague hand-off into a checkable one.
- **Include how to verify.** Spec Kit's `quickstart.md` and OpenHands' `setup.sh` show that build, test and run commands are the part of orientation an implementer most needs and can least afford to guess.
- **Compute structural facts instead of writing them down.** Aider's map shows that file, symbol and dependency structure can be derived on demand; the investigator should use tools for this and spend its judgment on intent and conventions.
- **Keep the standing file tiny and admission-controlled.** Only policy and pitfalls that someone has actually hit (BMAD "record"), with audits that can only shrink it.
- **Index standing knowledge with one-line descriptions** (Agent OS `index.yml`, OpenHands keyword triggers) so the investigator pulls in only what is relevant.
- **Put human review at the brief, not only at the diff.** Errors here multiply downstream.

### Worth avoiding

- **Whole-repository documentation as a prerequisite.** BMAD built this and deprecated it; it is expensive, goes stale, and agents read code better than prose about code.
- **Repo overviews, directory trees and tech-stack lists in always-loaded files.** The ETH study found overviews did not help and context files raised cost by over 20%: [Evaluating AGENTS.md](https://arxiv.org/abs/2602.11988).
- **Memory that is read on every task and updated by hand.** Cline's Memory Bank depends entirely on its own accuracy and has no check for it; a wrong file is followed faithfully.
- **Standards without a verification step.** Agent OS re-syncs the index but never checks that a standard still matches the code.
- **One large investigation prompt.** HumanLayer reported unreliable instruction-following from prompts with 85+ instructions and moved to smaller stages.
- **An investigator that also recommends the solution.** It blurs responsibility with the planner and makes the brief harder to verify.
- **Explorers that never see repository rules.** Claude Code's Explore and Plan skip `CLAUDE.md` for speed; for us the investigator should read the instruction files, since reconciling them with the code is part of its job.
- **Relying on role-play pipelines for existing code.** MetaGPT-style document chains work on artifacts they generated themselves and do not transfer to a codebase they did not write.

### Whether briefs are kept

The sources disagree on whether briefs are kept: HumanLayer stores every research document as searchable history; Claude Code and Roo discard them. The owner decided this on LAB-127: the brief stays in the run that produced it, and a disposable cache copy carries it between runs. See [`investigator-draft.md`](investigator-draft.md).
