# Dev Skills Project - AI Agent Instructions

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
