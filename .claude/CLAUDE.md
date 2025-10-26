# Dev Skills Project - AI Agent Instructions

## Skill Versioning

**CRITICAL:** When modifying any SKILL.md file, you MUST increment the version number in the front matter.

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

### Workflow

1. Make your changes to the SKILL.md file
2. Determine the appropriate version increment (MAJOR/MINOR/PATCH)
3. Update the `version:` field in the front matter
4. Include version change in commit message (optional but recommended)

**Never commit a SKILL.md change without updating the version number.**
