# Jason Gorman Research Integration Plan

## Overview

Comprehensive research on Jason Gorman's "Proper RED" practices directly addresses the #1 problem in tdd-interactive: agent over-implementation during RED phase.

**Source:** `docs/Jason Gorman's Actionable Guides_ Writing Proper F.md`

**Key Insight:** The research provides specific, actionable practices that align perfectly with observed agent failures (premature design decisions, unnecessary dependencies, implementation thinking).

---

## Why This Matters

### Current Problem
Agents consistently over-implement during RED phase despite existing guardrails:
- Add unnecessary dependencies
- Make implementation decisions disguised as "API-only"
- Stay in execution mode even during self-review

### How Research Helps
- Provides concrete checkpoints: compilation error → assertion failure progression
- Establishes "Golden Rule" framework agents can follow
- Offers specific language for what "minimal" means
- Defines clear failure types agents can recognize

---

## Core Practices to Integrate

### High Priority (Integrate First)

#### 1. **The Golden Rule - Usage-Driven Design**
- Don't write source code until test requires it
- Reference in TEST first, let code not compile
- Add minimal declarations to fix compilation
- **Integration target:** RED phase Getting Started, Pre-STOP #1 checklist

#### 2. **Assertion-First Workflow**
- Write assertion FIRST (the question)
- Work backwards to action → setup
- Prevents wrong setup for the question
- **Integration target:** RED phase guide, replace/strengthen existing assertion-first section

#### 3. **Implement Just Enough to See Assertion Fail**
- Distinguish compilation errors from assertion failures
- Add stubs that return empty/default values (not null)
- Run test until ASSERTION fails (not NullPointer)
- **Integration target:** New section in red-phase-guide.md, Pre-STOP #1 checklist

#### 4. **One Reason to Fail**
- Each test asks ONE question
- Prevents agents solving too much at once
- Baby steps enforcement mechanism
- **Integration target:** Review guidelines, escalation triggers

### Medium Priority (Strengthen Existing)

#### 5. **Triangulation**
- Use when solution isn't obvious
- Start with simplest test (can pass with literal)
- Force generalization with second test
- **Integration target:** Add decision tree to escalation protocol

#### 6. **Baby Steps with Time Boundaries**
- Get to GREEN within 1-2 minutes
- Fast feedback loops
- Everything worked recently, bug must be in last few lines
- **Integration target:** Consider adding time guidance to phases

---

## Specific Integration Tasks

### Task 1: Update `red-phase-guide.md`

**Add to top:**
```markdown
## Foundational Principle: Test Your Tests

Always see your test fail for the RIGHT reason before making it pass.
This ensures the test will actually catch bugs if implementation is wrong.
```

**Add progression section:**
```markdown
## The Three-Stage RED Progression

1. **Won't Compile** - Test references non-existent code (Golden Rule in action)
2. **Compiles but Runtime Error** - Stub added but returns null/throws
3. **Assertion Fails** ✓ - Proper RED state, ready for GREEN

Only stage 3 is proper RED. Stages 1-2 are setup to reach proper RED.
```

**Strengthen existing assertion-first:**
- Add "the test is about the QUESTION" framing
- Include "work backwards" explicit instruction
- Add example showing assertion → action → setup order

**Add minimal stub definition:**
```markdown
## What "Minimal Stub" Means

- Return empty collections (not null)
- Empty method bodies (not throwing NotImplemented)
- Default/zero values for primitives
- NO logic, NO decisions, NO implementation thinking

Example:
```swift
func getTitles() -> [String] {
    return []  // Empty, not implementation
}
```
```

### Task 2: Update Pre-STOP #1 Checklist

**Add to `review-guidelines.md` RED phase checklist:**

```markdown
### Before Requesting Approval (Pre-STOP #1)

Agent Self-Review Checklist:
- [ ] Test fails with ASSERTION error (not compilation/NullPointer)
- [ ] I wrote assertion FIRST, worked backwards to setup
- [ ] Test asks only ONE question (one reason to fail)
- [ ] Test name clearly states WHAT should happen (not implementation detail)
- [ ] I added ONLY declarations needed to make test compile
- [ ] No implementation logic exists (only stubs with empty/default returns)
- [ ] I can explain what rule/behavior this test verifies

Reviewer Checklist:
[existing items...]
- [ ] Test fails for right reason (assertion, not error)
- [ ] Only minimal stubs exist, no logic
```

### Task 3: Update `escalation-protocol.md`

**Add new escalation trigger:**

```markdown
## Trigger: Thinking About Implementation During RED

**Symptoms:**
- Finding yourself thinking about HOW to implement
- Considering data structures or algorithms
- Adding properties, parameters, or types beyond what test requires
- Justifying code as "just API" when it makes decisions

**Immediate Actions:**
1. STOP implementation thinking
2. Review "The Golden Rule": Don't write source code until test requires it
3. Review "Assertion-First": Did I write assertion first and work backwards?
4. Delete any implementation logic
5. Reset to minimal stubs (empty returns, default values)

**If stuck after reset:**
- Escalate to reviewer
- Ask: "What is the absolute minimum I need to add to see this assertion fail?"
```

**Add triangulation guidance:**

```markdown
## When Solution Isn't Obvious

If you're tempted to write complex logic immediately, use triangulation:

1. Write simplest possible test (can pass with literal value)
2. Make it pass with hardcoded value (yes, actually return 42!)
3. Write ANOTHER test that forces generalization
4. Refactor to general solution
5. Repeat until no more tests needed

Don't leap across the lake - use stepping stones.
```

### Task 4: Create Quick Reference

**New file: `public/tdd-interactive/red-phase-quick-ref.md`**

Condensed (~50 lines) version with:
- The 8 practices (bullet points only)
- RED phase checklist
- Common mistakes with fixes
- Link to full research document

### Task 5: Add Multi-Language Examples

**Extend examples in red-phase-guide.md:**

Add Swift, TypeScript, Python equivalents of:
- Empty collection returns
- Minimal stub implementations
- Assertion-first progression

---

## Content Organization

### What Goes Where

**`red-phase-guide.md`** - Main workflow guide
- Three-stage progression
- Assertion-first methodology
- Golden Rule
- Minimal stub definitions
- Examples

**`review-guidelines.md`** - Verification checklists
- Pre-STOP #1 extended checklist
- "Right reason to fail" verification

**`escalation-protocol.md`** - When/how to get help
- Implementation thinking trigger
- Triangulation guidance
- Reset procedures

**`red-phase-quick-ref.md`** - New condensed reference
- 8 practices summary
- Checklist only
- Fast lookup during execution

**`docs/` or `references/`** - Full research
- Keep complete Gorman research document
- Link from skill files

---

## Potential Issues to Address

### 1. Redundancy Check
Before integration, audit existing content in:
- `red-phase-guide.md`
- `escalation-protocol.md`
- `review-guidelines.md`
- `SKILL.md`

Remove contradictions, consolidate overlaps.

### 2. Length Management
Full Gorman research is 328 lines. Options:
- ✓ Create condensed version for skill prompt
- ✓ Keep full version as reference documentation
- Link between them

### 3. Language-Specific Gaps
Current examples are Java-heavy. Need:
- Swift examples (for iOS projects)
- TypeScript/JavaScript examples
- Python examples

### 4. Time Boundaries
Research mentions "1-2 minutes" for baby steps. Consider:
- Is this practical for agents?
- Should we add time guidance to phases?
- Or keep it conceptual?

---

## Success Metrics

How will we know if integration worked?

### Observable Changes
- [ ] Agents reference "Golden Rule" in self-reviews
- [ ] Agents explicitly check: "Does test fail with assertion error?"
- [ ] Agents catch themselves doing implementation thinking
- [ ] Agents use triangulation language when stuck
- [ ] Pre-STOP #1 rejections decrease (agents self-correct)

### Negative Indicators (Things to Monitor)
- Agents become paralyzed by too many rules
- Checklist becomes mechanical (box-ticking without understanding)
- Integration contradicts existing skill guidance

---

## Implementation Sequence

### Phase 1: Foundation (Do First)
1. Create quick reference document
2. Update red-phase-guide.md with:
   - Three-stage progression
   - Minimal stub definitions
   - Strengthen assertion-first

### Phase 2: Verification (Next)
3. Update Pre-STOP #1 checklist in review-guidelines.md
4. Add "right reason to fail" checks

### Phase 3: Support (Then)
5. Update escalation-protocol.md with:
   - Implementation thinking trigger
   - Triangulation guidance
6. Add multi-language examples

### Phase 4: Documentation (Finally)
7. Move full research to references/
8. Update SKILL.md links
9. Add to testing-guide.md if relevant

---

## Open Questions

1. **Should we version this as v2.4.0 or v3.0.0?**
   - Significant enough change for major version?
   - Or incremental improvement?

2. **How much detail in Pre-STOP #1 checklist?**
   - Too detailed = mechanical
   - Too vague = ineffective

3. **Time boundaries - yes or no?**
   - "Get to GREEN in 1-2 minutes"
   - Helpful constraint or unrealistic for agents?

4. **Triangulation - main workflow or escape hatch?**
   - Should it be in main RED guide?
   - Or only in escalation protocol?

---

## Next Steps

1. **Review this plan** - Adjust priorities/sequence as needed
2. **Choose Phase 1 starting point** - Quick ref or red-phase-guide update?
3. **Create test case** - Pick real agent session log to validate against
4. **Implement incrementally** - One task at a time with testing
5. **Update log** - Track what worked/didn't work

---

## References

- Source research: `docs/Jason Gorman's Actionable Guides_ Writing Proper F.md`
- Current skill: `public/tdd-interactive/SKILL.md`
- Problem analysis: `TODO/tdd-practitioner.md`
- Session logs: (link to specific problematic sessions when available)
