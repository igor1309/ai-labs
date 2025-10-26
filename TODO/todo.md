Explore [agents](https://github.com/microsoft/amplifier/tree/main/.claude/agents) and [commands](https://github.com/microsoft/amplifier/tree/main/.claude/commands) at [Amplifier](https://github.com/microsoft/amplifier/)

Consider TDD skill creation methodology - see ./docs/REFERENCES.md.

## Phase 2: Shared TDD Standards (Future Enhancement)

**Goal:** Test if Claude Code skills support parent directory references (`../`) to enable sharing quality-standards.md across multiple TDD skills.

**Current state:**
- `tdd-interactive/standards/quality-standards.md` exists (self-contained)
- All current skill references use `./` (same directory only)
- No existing skills use `../` (parent directory references)

**Test plan:**
1. Create test skill that references `../tdd-standards/quality-standards.md`
2. Verify if Claude Code resolves parent directory references correctly
3. If YES → promote to shared `/public/tdd-standards/` location
4. If NO → duplicate into each skill's `/standards/` subdirectory

**Target skills for sharing:**
- `tdd-interactive`
- `tdd-scaffold-review`
- Future TDD-related skills

**Benefits if successful:**
- Single source of truth for TDD quality standards
- Easier maintenance across multiple TDD workflows
- Consistent standards enforcement

See [`using-superpowers/SKILL.md`](https://github.com/obra/superpowers/blob/main/skills/using-superpowers/SKILL.md)
- for enforcing rules/skills
- adapt/follow
- announce

Consider "Here's my copy of programming book. Please read the book and pull out reusable skills that weren't obvious to you before you started reading".