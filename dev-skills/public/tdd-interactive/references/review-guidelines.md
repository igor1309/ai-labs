# Review Guidelines

Guidelines for reviewing work at the two verification gates in the TDD Interactive workflow.

## STOP #1: RED Phase Review

### What to Review

**1. Proper RED State**
- [ ] Code compiles successfully
- [ ] Test runs and fails (not passing, not erroring)
- [ ] Test fails for the RIGHT reason
- [ ] Failure message clearly shows what's missing

**2. Test Quality**
- [ ] Test name matches what's being tested
- [ ] Test asserts ONLY what the name promises (no over-assertion)
- [ ] Test setup is simple (not creating imaginary infrastructure)
- [ ] No implementation thinking (no mocks for components that don't exist)
- [ ] Test is focused on WHAT should happen, not HOW

**3. Test Code Quality**
- [ ] Test is readable and clear
- [ ] Setup → Action → Assertion structure is evident
- [ ] No complex logic in the test itself
- [ ] Follows standards in `./quality-standards.md` (naming, structure, no inline AAA comments)

### Common Rejection Reasons

❌ **Reject if:**
- Test passes immediately (not RED)
- Compilation errors (not proper RED state)
- Test fails for wrong reason (e.g., "Account not found" when testing balance)
- Over-engineering (mocks, complex setup, imaginary dependencies)
- Test asserts more than the name promises

✅ **Approve if:**
- Clear RED state with right failure
- Simple, focused test
- Obvious what behavior is being specified

### Review Questions to Ask

1. "Does the failure message show exactly what's missing?"
2. "Could this test be simpler?"
3. "Is the agent thinking about implementation instead of behavior?"
4. "Will this test actually drive the minimal implementation?"

---

## STOP #2: REFACTOR Phase Review

### What to Review

**1. Code Quality**
- [ ] Check for duplication (in tests AND production code)
- [ ] Check for poor naming (variables, functions, classes)
- [ ] Check for complex logic that could be simplified
- [ ] Check for violations of coding standards (see `./quality-standards.md`)
- [ ] Check for "code smells"

**2. Refactoring Execution**
- [ ] All tests still pass after refactoring
- [ ] Refactoring actually improved something (not just shuffling)
- [ ] Changes are focused (not mixing refactor with new features)
- [ ] Git diff shows what was refactored

**3. Refactoring Scope**
- [ ] Agent didn't skip refactoring review with "looks perfect"
- [ ] Agent actually looked at both test code and production code
- [ ] Opportunities for improvement were identified (or genuinely none exist)

### Common Rejection Reasons

❌ **Reject if:**
- Agent said "looks perfect" without genuine analysis
- Obvious duplication not addressed
- Poor variable names not improved
- Complex logic not simplified
- Tests are failing after refactoring
- Agent skipped reviewing test code

✅ **Approve if:**
- Genuine refactoring was done (or genuinely not needed)
- Code quality improved
- All tests still green
- Changes are clean and focused

### Review Questions to Ask

1. "Did the agent actually look for refactoring opportunities?"
2. "Is there duplication I can see that the agent missed?"
3. "Are the names clear and intention-revealing?"
4. "Could this logic be simpler?"
5. "Did the agent review BOTH test and production code?"

---

## Common Patterns to Watch For

### Agent Shortcuts

**"Looks perfect" syndrome:**
- Agent quickly says "no refactoring needed" without analysis
- **Action:** Ask agent to review specific code sections for improvement

**Implementation thinking during RED:**
- Agent creates complex test setup with mocks
- **Action:** Reject and ask for simpler test focused on behavior

**Skipping proper RED:**
- Test passes immediately or fails with compilation error
- **Action:** Reject and ask for proper RED state

**Over-assertion:**
- Test checks multiple things when name promises one thing
- **Action:** Ask agent to focus test on single behavior

### Good Behaviors to Reinforce

✅ Simple, focused tests
✅ Genuine refactoring analysis
✅ Clear failure messages
✅ Minimal implementation
✅ Systematic problem-solving when stuck

---

## Approval Criteria Summary

### STOP #1 (RED) - Approve when:
1. Proper RED state (compiles, runs, fails for right reason)
2. Simple test (setup → action → assertion)
3. No implementation thinking
4. Test matches its name

### STOP #2 (REFACTOR) - Approve when:
1. Genuine refactoring review was done
2. Improvements made (or genuinely not needed)
3. All tests still green
4. Code quality improved

---

## For Future AI Reviewer

When acting as reviewer, follow this protocol:

1. **Read the presented work** (test code, failure output, or refactored code)
2. **Apply the checklist** for the current stop
3. **Make a decision:**
   - Approve with "go" if criteria are met
   - Provide specific feedback if criteria are not met
4. **Give constructive feedback:** Point to specific issues, suggest improvements
5. **Wait for revisions** if rejected, then review again

**Your role as reviewer:**
- Enforce discipline and quality standards
- Prevent shortcuts and corner-cutting
- Ensure proper TDD workflow is followed
- Provide guidance when executing agent is stuck
