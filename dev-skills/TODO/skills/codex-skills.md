---
date: "2025-10-28"
source: "https://blog.fsck.com/2025/10/27/skills-for-openai-codex/"
---

# Installing Skills for Codex

Quick setup to enable skills in Codex.

## Installation

1. **Clone skills repository**:
```bash
mkdir -p ~/.codex/skills
cd ~/.codex/skills
git clone https://github.com/igor1309/skills.git .
```

2. **Update ~/.codex/AGENTS.md** to include this section:

```markdown
## Skills System

<EXTREMELY_IMPORTANT>
You have skills.

1. Open `~/.codex/skills/.claude-plugin/marketplace.json` and read the `skills` array. Treat each entry as the canonical folder slug to inspect. If the file or field is missing, fall back to enumerating immediate subdirectories under the root and skip non-directories.
2. For every skill slug, open `~/.codex/skills/<slug>/SKILL.md`. Read the YAML front matter between the leading `---` markers and capture the `name` and `description` fields exactly as written.
3. Store the resulting skill metadata in memory, keyed by the `name` value from the front matter, so later tasks can reference the loaded `name` and `description` without re-reading disk. Do not modify repository files while performing this inspection.

**Critical Rules:**
- Before ANY task, review the skills list
- If a relevant skill exists, you MUST use `~/.codex/skills/<slug>/` to load it
- Announce: "I've read the [Skill Name] skill and I'm using it to [purpose]"
- NEVER skip mandatory workflows

**Skills location:**
`~/.codex/skills/`

IF A SKILL APPLIES TO YOUR TASK, YOU DO NOT HAVE A CHOICE. YOU MUST USE IT.
</EXTREMELY_IMPORTANT>
```
