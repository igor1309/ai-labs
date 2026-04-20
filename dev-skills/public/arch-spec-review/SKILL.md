---
name: arch-spec-review
description: Review architecture specifications for completeness, appropriate abstraction level, separation of concerns, implicit architectural risk, and the intentionality of mature architecture decisions. Use when reviewing top-level, implementation-agnostic architecture documents that define system boundaries, responsibilities, flows, constraints, and rationale without prescribing implementation details.
version: "1.0.2"
author: Igor Malyarov
---

# Architecture Specification Review

Review architecture specifications at the appropriate level of abstraction, evaluating whether they successfully define system structure and architectural reasoning without drifting into implementation details.

## Document Classification

Architecture specifications exist on a spectrum:

**Top-level Architecture Specs** (this skill's focus):
- Define WHO does WHAT
- Establish boundaries and responsibilities  
- Describe flows and coordination patterns
- State architectural constraints and guarantees
- Identify extension points
- Implementation-agnostic

**Executable Specifications**:
- Define precise behavior and semantics
- Include comprehensive test scenarios
- Specify input/output contracts exactly
- More detailed, but still technology-neutral

**Implementation Documentation**:
- Describes HOW components work internally
- Names specific data structures, algorithms, protocols
- Technology and framework specific

## Review Process

### 1. Understand Document Intent

Before reviewing, read the document's stated goals:
- What level of abstraction does it target?
- What scope boundaries are declared?
- What's explicitly deferred or out of scope?

**Never review against your expectations - review against the document's stated purpose.**

Treat the document as a standalone artifact of reasoning. Review the thinking it encodes, not the effort that produced it.

### 2. Evaluate Completeness

For architecture specifications, assess whether these are clear:

**Boundaries**: Is each component's responsibility distinct and well-defined?
- Can you explain what each component does without talking about how?
- Are there clear lines between components?
- Does the structure appear intentional rather than incidental?

**Flow of Control and Data**: Are the key scenarios described clearly enough to follow how actions and information propagate?
- Bootstrap/initialization
- Primary operational paths
- Update/refresh mechanisms
- Error handling boundaries

**Constraints**: Are architectural guarantees stated?
- Synchronicity/asynchronicity
- Atomicity and consistency
- Immutability
- Failure modes

**Dependencies and Coupling**: Are hard edges visible?
- Which dependencies are load-bearing?
- Where are components too entangled or too opaque?
- Does each major part justify its existence within the whole?

**Resilience and Change**: Does the structure appear stable under growth or failure?
- How would the design react to scale, feature growth, or subsystem failure?
- Are change pressure and failure boundaries legible at the architectural level?

**Extension Points**: Can the design evolve?
- What can be swapped without ripple effects?
- Where is flexibility preserved?

**Deferred Decisions**: What's appropriately left for later?
- Are open items acknowledged explicitly?
- Is deferral justified (team decision needed, product semantics unclear)?

### 3. Check Abstraction Discipline

Architecture specs should NOT specify:
- Internal data structures ("uses a Dictionary keyed by...")
- Algorithms or specific mechanisms ("uses copy-on-write...")  
- Serialization formats or protocols (unless that IS the architecture)
- Specific technologies or frameworks
- Implementation-level error types

Architecture specs SHOULD specify:
- Responsibilities ("Repository provides synchronous reads")
- Guarantees ("atomic swap - readers see old or new, never partial")
- Boundaries ("Orchestrator never handles domain queries")
- Constraints ("immutable snapshots")
- Coordination patterns ("Orchestrator loads, processes, then swaps")

### 4. Self-Evaluate Before Presenting

**Critical pause: Before sharing your review, evaluate your own findings.**

Ask yourself:
- **Am I asking about HOW when the doc only promises WHO and WHAT?**
  - Bad: "What data structure does the Repository use?"
  - Good: "What guarantees does the Repository provide to readers during updates?"

- **Would my questions add clarity or just detail noise?**
  - If the answer doesn't affect architectural boundaries, it's probably implementation detail.

- **Am I treating absence of rationale as a signal?**
  - If a major boundary, dependency, or constraint appears unexplained, treat that as architectural risk rather than assuming it is fine.

- **Am I respecting explicit scope boundaries?**
  - If the doc says "duplicates policy is TBD," don't demand a resolution.
  - If the doc says "implementation-agnostic," don't ask about specific technologies.

- **Could I explain why the architecture needs to specify this?**
  - If you can't articulate the architectural impact, question your question.

**Change your perspective:**
- **Read as the author**: Are you demanding details they intentionally abstracted?
- **Read as an implementer**: Do your questions help understand the structure, or just satisfy curiosity about mechanics?
- **Read as a future maintainer**: Would knowing this detail help understand the design decisions and trade-offs?

### 5. Present Findings

Structure your review:

**What Works**:
- Acknowledge clear boundaries, well-defined flows, explicit constraints
- Recognize appropriate deferrals and scope discipline

**Questions** (only architectural concerns):
- Ambiguities in responsibilities or guarantees
- Missing flows or undefined coordination
- Unclear dependency edges or unexplained coupling
- Missing rationale behind major structural choices
- Unclear extension points
- Contradictions or gaps in constraints

**Clarity Index**:
- Does the document communicate architecture as reasoning, not just topology?
- Can a neutral reader infer why this structure exists, not only what boxes connect to what?

**Not**: "How does X work internally?"
**But**: "What guarantee does X provide to its clients?"

**Avoid**:
- Premature optimization suggestions
- Implementation recommendations  
- Technology preferences
- Asking about appropriately deferred decisions

## Tone

Analytical, dispassionate, exact. Evaluate quality of thinking, not taste or polish.

## Anti-Patterns to Avoid

**Over-Specification Demands**:
- Asking for internal mechanisms when boundaries are clear
- Requesting concrete examples that could become templates
- Pushing for decisions the document explicitly defers

**Scope Creep**:
- Suggesting features beyond the stated scope
- Reviewing against a different abstraction level than targeted
- Conflating "architecture" with "implementation"

**Pattern Matching**:
- Expecting specific section structures
- Demanding your preferred architectural style
- Checking against a mental template rather than reading what's there

## Success Criteria

A good architecture specification:
- ✅ Clearly separates concerns
- ✅ Defines responsibilities without dictating mechanisms  
- ✅ Describes flows at the right level
- ✅ States constraints and guarantees explicitly
- ✅ Identifies extension points
- ✅ Acknowledges deferred decisions appropriately

A good review:
- ✅ Evaluates against the document's stated goals
- ✅ Identifies genuine architectural ambiguities or gaps
- ✅ Respects abstraction boundaries
- ✅ Avoids implementation details
- ✅ Recognizes when deferral is appropriate

## Common Pitfalls

**For Reviewers**:
- Asking "what format is the data?" when the architecture just needs to move data between components
- Demanding specific error handling mechanisms when error boundaries are clear
- Requesting implementation details about already-clear abstractions
- Forgetting that the document author made deliberate choices about what to include

**For Authors**:
- Over-specifying (crossing into implementation)
- Under-specifying (leaving architectural ambiguity)
- Mixing abstraction levels inconsistently
- Not explicitly acknowledging deferred decisions

## Key Reminder

Architecture specs are about **structure and boundaries**, not **implementation and mechanisms**. 

When in doubt, ask: "Does this question change how components interact, or just how a component works internally?"
