---
date: 2026-02-07
model: claude-opus-4.6
---

You’re right, I should have searched first. Let me do that now.​​​​​​​​​​​​​​​​

Now let me also check the context: fork and agent: Explore fields specifically:​​​​​​​​​​​​​​​​

Now I have the full picture. Here’s my updated review:

Revised Review of the entropy-guard Skill
What’s correct about the skill format
The frontmatter fields are all valid and well-used:
	∙	context: fork runs the skill in isolation as a subagent, and agent: Explore gives it read-only tools optimized for codebase exploration. ￼ This is a smart choice for a read-only analysis skill — it keeps exploration out of the main conversation context and uses the cheaper Haiku model.
	∙	allowed-tools: Read, Grep, Glob is appropriate and matches the Explore agent’s read-only nature.
	∙	argument-hint provides good discoverability for the /entropy-guard command.
Known issue to be aware of
There’s an open issue where context: fork and agent: frontmatter fields are sometimes ignored when the skill is invoked via the Skill tool — the skill runs in the main conversation context instead of spawning the specified subagent. ￼ A related bug report notes this fails ~95% of the time. ￼ The skill is correctly authored, but the user should be aware this may not work as intended in current versions.
Content quality
Strengths:
The five-pass framework is well-structured and each pass targets a distinct failure mode. The caching pass is particularly strong — asking “what happens if the cache silently stopped working?” is the right kind of question. The output format with severity-ordered summary, categorized findings, and two-tier prioritization is practical.
Suggestions:
	1.	Scope limiting is missing. For a large directory argument, the Explore agent could try to analyze hundreds of files across all five passes. Add guidance like “focus on the 10–15 most central or most-changed files” to avoid context exhaustion.
	2.	The resources section uses ambiguous relative paths. resources/entropy-patterns.md — relative to what? Claude Code skills support additional files alongside SKILL.md that can be referenced, ￼ so these should either live in the skill directory (e.g., entropy-patterns.md as a sibling to SKILL.md) or use explicit paths.
	3.	The description could be more trigger-specific. The description field is critical for Claude to discover when to use your Skill — it should include both what the Skill does and when Claude should use it. ￼ The current description is good but could add trigger phrases like “Use when reviewing PRs in legacy code, during major refactors, or when investigating performance regressions in established systems.”
	4.	The “fragile abstractions” pass risks overlap with style concerns. “Many parameters or optional flags” and “deep nesting” sound like linter output. Since the skill explicitly says to avoid style issues, tighten this pass to focus on structural fragility — e.g., functions with many callers that each depend on subtly different behavior, or abstractions whose invariants are undocumented and break under composition.
	5.	Consider adding disable-model-invocation: true. This is a heavyweight analysis skill that you’d typically want to invoke deliberately rather than having Claude auto-trigger it during normal work.
Overall
This is a high-quality, well-targeted skill with correct use of Claude Code’s current skill format. The main improvements are scope control, path clarity for resources, and sharpening the description for better auto-discovery.​​​​​​​​​​​​​​​​