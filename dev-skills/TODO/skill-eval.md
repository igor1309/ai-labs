# TDD Interactive Skill Evaluation

## Goal

Test whether agents using the tdd-interactive skill achieve proper RED state and follow the workflow correctly.

## Approach

**Test Setup:**
- Agent A uses tdd-interactive skill to implement a feature
- Agent B (evaluator/judge) assesses whether Agent A achieved proper RED
- Evaluate: skill loading, workflow adherence, RED state quality

## Key Challenges

1. **What to test?**
   - Skill activation (announcement appears)
   - Workflow adherence (stops at STOP #1 and STOP #2)
   - Proper RED achievement (core discipline - hardest to evaluate)
   - Final implementation quality (less interesting)

2. **"Proper RED" is subjective**
   - Requires understanding codebase context
   - Need to distinguish API from IMPLEMENTATION
   - Judge must evaluate git diff + test output

## Testing Layers

### Layer 1: Skill Activation (Easy)
```
Input: "Implement X using TDD with verification gates. I am the reviewer."
Expected: "I'm using the TDD Interactive skill"
Validation: String matching
```

### Layer 2: Workflow Adherence (Medium)
```
Check:
- Agent stops after RED (waits for "go")
- Agent stops after REFACTOR (waits for "go")
- Agent doesn't proceed without "go"
Validation: Count stops, detect premature progression
```

### Layer 3: RED State Quality (Hard)
Evaluate git diff at STOP #1:

**Evaluator prompt template:**
```
Review this git diff from STOP #1 (RED phase).

Production code changes:
[git diff output]

Test code:
[test file content]

Test output:
[failure message]

Answer:
1. Does production code contain implementation logic? (YES/NO)
2. Does test compile? (YES/NO)
3. Does test fail for right reason (not compilation)? (YES/NO)
4. List any implementation logic found: [specifics]

Score: PASS/FAIL with explanation
```

### Layer 4: Pre-STOP Self-Review Artifact (Medium)
```
Check if agent produced mandatory table:
| File | Line(s) | Change Description | Category | Action |

Validate:
- Table present?
- All changes listed? (compare with git diff)
- Correct categorization?
```

## Prototype Sketch

```python
class TDDInteractiveSkillTest:
    def run_test(self, task, codebase):
        # 1. Start agent with skill
        response = agent.ask(
            f"Implement {task} using TDD with verification gates. "
            "I am the reviewer."
        )

        # 2. Verify skill announcement
        assert "I'm using the TDD Interactive skill" in response

        # 3. Wait for STOP #1
        assert agent_stopped_at_red()

        # 4. Capture artifacts at STOP #1
        red_diff = git.diff()
        test_output = extract_test_output(response)
        pre_stop_table = extract_table(response)

        # 5. Evaluate with judge agent
        evaluation = evaluate_red_state(
            diff=red_diff,
            test_output=test_output,
            table=pre_stop_table
        )

        # 6. Proceed or fail
        if evaluation.passed:
            agent.ask("go")
            # Continue to GREEN, REFACTOR...
        else:
            return FAIL(evaluation.issues)

def evaluate_red_state(diff, test_output, table):
    """Use evaluator LLM with red-phase-examples.md as context"""
    judge = LLM(model="claude-3.5-sonnet")

    return judge.ask(f"""
    Context: {read_file("red-phase-examples.md")}

    Evaluate this RED phase:
    Production changes: {diff}
    Test failure: {test_output}
    Pre-STOP table: {table}

    Return JSON: {{"passed": bool, "issues": [...]}}
    """)
```

## Metrics to Track

1. **Skill activation rate**: % skill loads when prompted correctly
2. **STOP compliance**: % agent stops at both gates
3. **RED purity score**: % STOP #1s with zero implementation logic
4. **Pre-STOP table quality**: % with correct categorization
5. **False negatives**: Agent marks API as IMPLEMENTATION (too strict)
6. **False positives**: Agent marks IMPLEMENTATION as API (too lenient)

## Phased Approach

**Phase 1: Manual Trials (Start Here)**
- Pick 3-5 simple tasks ("add validation for negative amounts")
- Run agents manually through skill
- Capture: conversation logs, git diffs, Pre-STOP tables
- Manually evaluate each RED state
- Build gold standard examples

**Phase 2: Semi-Automated**
- Script agent invocation
- Auto-capture artifacts (diffs, tables, test outputs)
- Manual evaluation of artifacts
- Refine evaluation criteria from edge cases

**Phase 3: Fully Automated**
- Build evaluator agent with refined prompt
- Compare evaluator vs gold standard
- Measure inter-rater reliability (human vs agent)
- Iterate evaluator prompt until >90% agreement

## Key Insight

**The evaluator has the same problem as the executing agent**: LLMs don't naturally understand the API vs IMPLEMENTATION boundary.

**Solution**: Give evaluator the same education - provide `red-phase-examples.md` as context when evaluating.

## Open Questions

1. Are we validating **the skill works** or measuring **how well LLMs can learn TDD**?
2. Should we test one layer at a time or end-to-end?
3. What's the minimum viable test? (probably: one task, manual eval, establish if this is even possible)
4. How do we handle codebase-specific context? (evaluator needs to understand domain)
5. Should evaluator be same model as executor or different?

## Next Steps (When Ready)

1. Choose 1-2 very simple tasks from existing codebase
2. Run through skill manually (capture everything)
3. Try to write evaluation criteria for "proper RED"
4. See if criteria is clear enough to be automated
5. If yes → build prototype evaluator
6. If no → refine examples/documentation first

## Meta Question

What's the actual goal?
- **Validate skill effectiveness**: Does it help agents achieve proper RED?
- **Compare models**: Which LLMs learn TDD best with this skill?
- **Improve skill**: Use eval results to refine documentation?
- **Regression testing**: Ensure skill changes don't break it?

Answer determines test design and success metrics.
