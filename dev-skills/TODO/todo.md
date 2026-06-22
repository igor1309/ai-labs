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

## process-gates: verify the real execution path, not just the config artifact

**Why:** an integration affordance was marked "done" once configured, without the
actual path ever being exercised (a Telegram menu entry set via `setMyCommands`
that the bot then rejected as an unknown command — "configured" ≠ "works"). The
gate that would have caught it: require a live end-to-end invocation for
user-facing affordances on external/integration surfaces.

**Proposed addition** to `public/process-gates/SKILL.md`:

- Completion Verification checklist item:
  > - [ ] For a user-facing affordance built on an external/integration surface
  >   (bot, plugin, third-party API/tool), the real end-to-end path was exercised
  >   live — the command/feature actually ran and produced the intended result —
  >   not merely configured. "Configured" ≠ "works."
- Step Closeout step 3 companion line:
  > For integration work, "required verification" includes invoking the actual
  > path, not just confirming the config artifact exists.

**Cost:** published marketplace skill — needs the dev-skills release flow
(dedicated branch, SKILL.md PATCH bump 1.2.0 → 1.2.1, `docs/log.md`, PR +
auto-merge, post-merge CI/skills-repo verify). Deferred until that flow is run.