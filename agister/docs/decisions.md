# Decisions

## D-1: How the Knowledge tab's editing fits ADR-009's read-only pages

- **Status:** Owner
- **Asked by:** Orchestrator, Multica issue LAB-44, before implementation; advisor run 20261002T084003Z-b61743 answered `owner`
- **Question:** LAB-44 asks the Agister pages to let the owner edit skill content (and agent configuration) from a new Knowledge tab, saving to disk. ADR-009 rule 2 says `agister pages` only reads and changes no setting. How does the Knowledge tab's editing fit?
- **Options:** 1. Amend ADR-009 with a new ADR: pages may write skill files and agent settings files, on loopback with the X-Agister-Pages header, refusing paths outside the shown repo's skill/settings folders; every other rule of ADR-009 stays. 2. Keep pages read-only: the Knowledge tab shows everything and offers "open in editor" / copyable paths; editing happens outside the page. 3. Split: ship the read-only Knowledge tab now (models, skills, usage, static checks), and take editing as a separate ADR and issue later.
- **Excluded:** 1: not now; writing from the page is its own ADR and issue. 2: editing in the page stays wanted.
- **Decision:** 3. Split: ship the read-only Knowledge tab now (models, skills, usage, static checks), and take editing as a separate ADR and issue later.
- **Rests on:** none
- **Follow-ups:** the read-only Knowledge tab (LAB-44); editing from the page as a separate issue with its own ADR amending ADR-009.

## D-2: What the Knowledge tab shows as an agent's skills

- **Status:** Owner
- **Asked by:** Orchestrator, Multica issue LAB-44, before implementation; advisor run 20261002T084003Z-c9b85f answered `owner`
- **Question:** LAB-44 asks to show "which skills are assigned to" each agent and to edit those assignments. Agister agents have no skills setting: by ADR-006 a call loads whatever skills its runtime loads from the repository (and the user's home), and Agister neither copies nor filters them. What does the Knowledge tab show as an agent's skills, and what is an "assignment"?
- **Options:** 1. No assignment concept: an agent's configured skills are the skills its runtime would load in that repo (repo skill folders per runtime, e.g. `.claude/skills`, `.agents/skills`, plus home folders), shown per runtime; "editing an assignment" is out of scope and the tab says so. Observed usage comes from run events. 2. Add an explicit per-agent `skills` setting (a new ADR amending ADR-006) that filters what a call loads, and let the tab edit it. 3. Show only observed usage from runs per agent, with no configured-skills view.
- **Excluded:** 2: changes ADR-006; Agister keeps not filtering skills. 3: hides what an agent would load.
- **Decision:** 1. No assignment concept: an agent's configured skills are the skills its runtime would load in that repo (repo skill folders per runtime, e.g. `.claude/skills`, `.agents/skills`, plus home folders), shown per runtime; "editing an assignment" is out of scope and the tab says so. Observed usage comes from run events.
- **Rests on:** none
- **Follow-ups:** the Knowledge tab lists, per agent, the skills its runtime would load and, apart from them, the skills its runs used.
