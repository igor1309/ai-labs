# Dev Skills Project - AI Agent Instructions

## Working Directory

**CRITICAL:** This is the `dev-skills/` project within the `ai-labs` repository - the skills marketplace development area.

**NEVER modify `~/.codex/skills/`** - that is the user's personal installation directory, NOT this repository.

When publishing skills:
1. Verify the SKILL.md front matter contains `author: Igor Malyarov`. Missing or empty `author` blocks publishing — add it before continuing. (Background: the field was removed from all skills at some point; re-introducing this gate prevents recurrence.)
2. Move to `public/<skill-name>/` when ready to publish
3. Update `public/.claude-plugin/marketplace.json`: add/update the skill entry in the skills array, and bump `metadata.version`. Bump `public/.codex-plugin/plugin.json` `version` to match.
4. Update `dev-skills/docs/log.md` for project-scoped changes. Update repo-root `docs/log.md` too only when the change is genuinely repo-wide.
5. Stop to commit on a dedicated branch (never directly on `trunk` — it is protected at the repo level).
6. Push the branch and open a PR into `trunk`, then enable auto-merge:
   - `git push -u origin <branch>`
   - `gh pr create --base trunk --title "<title>" --body "<body>"`
   - `gh pr merge <number> --merge --auto --delete-branch`
7. After the PR merges, ~1 min later, verify CI and skills repo:
   - Check CI completed: `gh run list --repo igor1309/skills --limit 1 --json status,conclusion,name`
   - Verify release version matches marketplace version: `gh release list --repo igor1309/skills --limit 1`
   - Verify skill exists in skills repo: `gh api repos/igor1309/skills/contents/<skill-name>/SKILL.md --jq '.name'`

## Alphabetical Ordering

**Skills MUST be listed in alphabetical order** in `public/.claude-plugin/marketplace.json` (skills array). This ensures consistency and makes it easy for users to find skills.

## Skill Versioning

**CRITICAL:** When modifying any SKILL.md file OR its supporting documents (e.g., files in `references/` subdirectory), you MUST increment the version number in the SKILL.md front matter.

### Versioning Rules

Follow semantic versioning (MAJOR.MINOR.PATCH):

- **MAJOR** (X.0.0): Breaking changes to workflow, incompatible with previous version
  - Example: Changing the fundamental workflow structure, removing phases

- **MINOR** (0.X.0): New features, new sections, significant additions
  - Example: Adding new phases, new reference documents, substantial content additions

- **PATCH** (0.0.X): Bug fixes, clarifications, minor improvements
  - Example: Fixing typos, clarifying existing instructions, adding examples, minor wording improvements

### Examples

```yaml
# Before (fixing typo)
version: "2.3.1"

# After (fixing typo)
version: "2.3.2"
```

```yaml
# Before (adding new standards reference)
version: "2.3.1"

# After (adding new standards reference)
version: "2.4.0"
```

```yaml
# Before (removing a phase)
version: "2.3.1"

# After (removing a phase)
version: "3.0.0"
```

### Changes to Supporting Documents

When modifying files in subdirectories like `references/`, you MUST also bump the parent SKILL.md version:

**Reference document changes trigger SKILL.md version bumps:**
- Added new reference document → MINOR bump to SKILL.md (if SKILL.md references it) or PATCH (if not explicitly referenced but affects behavior)
- Modified existing reference (new rules, standards, examples) → PATCH bump to SKILL.md
- Major changes to reference (removing sections, breaking changes) → MINOR or MAJOR bump to SKILL.md depending on impact

**Example:**
```
Changes:
- quality-standards.md: v1.0.0 → v1.2.0 (added 2 new standards)
- SKILL.md: v2.5.0 → v2.5.1 (PATCH bump because reference changed)
```

**Rationale:** Reference documents define skill behavior. Changes to references change how agents execute the skill, even if SKILL.md text doesn't change.

### Workflow

1. Make your changes to the SKILL.md file or supporting documents
2. Determine the appropriate version increment (MAJOR/MINOR/PATCH)
3. Update the `version:` field in SKILL.md front matter
4. Include version change in commit message (optional but recommended)

**Never commit a SKILL.md or its supporting documents without updating the SKILL.md version number.**
