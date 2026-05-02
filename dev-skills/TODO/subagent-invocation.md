# Sub-Agent Invocation in Skill Workflows

## Problem Statement

During TDD Interactive skill execution, we need adversarial review at Pre-STOP checkpoints. The executing agent (in "make it work" mode) cannot effectively critique its own work because it optimizes for task completion rather than constraint adherence.

## Hypothesis

Invoking a separate critic agent with fresh context and opposing objectives (find violations vs complete task) would provide more effective self-correction than same-agent self-review.

## Research Questions

1. **Technical Feasibility**
   - Can skills invoke sub-agents using the Task tool?
   - How does context/state pass between parent skill and sub-agent?
   - Can sub-agent results be fed back into skill workflow?

2. **Workflow Integration**
   - Where in the skill flow should sub-agent be invoked? (Pre-STOP #1, Pre-STOP #2, both?)
   - What happens if sub-agent finds violations? (Loop back, escalate, fail?)
   - How many critic iterations before escalation to human?

3. **Sub-Agent Design**
   - What should critic agent's prompt/role be?
   - What artifacts does it need? (git diff, test output, rule files?)
   - Should it be specialized per phase (RED critic vs REFACTOR critic)?

4. **Performance & UX**
   - Does nested agent invocation significantly slow workflow?
   - How does user see/track nested agent activity?
   - Can nested failures be debugged effectively?

## Success Criteria

**Minimal viable test:**
- Skill can invoke sub-agent at Pre-STOP #1
- Sub-agent receives production code changes (git diff)
- Sub-agent reports violations (or approval)
- Skill can react to sub-agent verdict (loop or proceed)

**Ideal state:**
- Sub-agent catches violations that same-agent self-review misses
- Reduced false-positives at human review stops
- Workflow remains responsive and debuggable

## Next Steps

1. Research existing skill examples that invoke sub-agents
2. Prototype minimal sub-agent invocation in test skill
3. Evaluate effectiveness: does critic agent catch violations executor agent missed?
4. If successful, integrate into tdd-interactive skill
5. If not feasible, document why and consider alternatives (forced context switch, external tooling)

## Related Files

- `/public/tdd-interactive/SKILL.md` - Main skill that needs critic integration
- `/public/tdd-interactive/red-phase-examples.md` - Rules that critic should enforce
- This issue emerged from analysis of agent failing to self-correct despite having clear rules
