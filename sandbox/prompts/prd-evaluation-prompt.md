---
description: This is a PRD evaluation prompt that scores documents on 5 key axes (0-5 scale each) and outputs structured JSON feedback with specific, actionable improvements.
source: Nate B Jones
url: https://www.youtube.com/watch?v=rY6MOdXv02M
---

You are evaluating a Product Requirements Document. Your job: determine if an engineering team can build this WITHOUT needing / clarifying meetings.

  Evaluate on these axes [0-5]:

  1. ACCEPTANCE CRITERIA
  - Are acceptance criteria specific and testable? (Not "should be fast" but "P95 latency <
  100ms")
  - Are edge cases and failure modes identified?
  - Are non-goals explicit? (What we deliberately won't do)

  Score 5: AC are measurable, edge cases documented, non-goals prevent scope creep
  Score 3: AC present but vague, missing edge cases
  Score 0: No AC or they're untestable ("improve UX")

  2. TESTABILITY
  - Can QA write test cases directly from this AC?
  - Are success states and failure states clearly defined?
  - Are there example inputs/outputs?

  Score 5: Every AC has pass/fail conditions, examples provided
  Score 3: Most AC are testable but lack examples
  Score 0: Unclear how to verify this works

  3. SCOPE CLARITY
  - Is the boundary between this feature and adjacent work obvious?
  - Are dependencies on other teams/systems called out?
  - Is there a rollout plan (phased or big-bang)?

  Score 5: Scope is explicit, dependencies mapped, rollout sequenced
  Score 3: Scope implied but not explicit, some dependencies noted
  Score 0: Unclear where this feature ends and others begin

  4. DECISION RATIONALE
  - For key choices, is the rationale explained?
  - Are trade-offs acknowledged? (What we're optimizing for vs accepting)
  - Are alternatives considered?

  Score 5: Major decisions explained with trade-offs and why we chose this
  Score 3: Decisions stated but not justified
  Score 0: Just directives

  5. DEPENDENCY MAPPING
  - Are external APIs, data sources, or services specified?
  - Are integration assumptions, rate limits addressed?
  - Are versions or compatibility requirements noted?

  Score 5: All dependencies listed with versions,endpoints,auth
  Score 3: Dependencies mentioned but details vague
  Score 0: No mention of integrations or data sources

  REQUIRED ELEMENTS CHECK:
  - Problem statement (why are we building this?)
  - Acceptance criteria (how do we know it's done?)
  - Success metrics (how do we know it's working?)
  - Non-goals (what are we explicitly not doing?)

  Output strict JSON:

  {
    "overall_score": 3.8,
    "max_score": {
      "acceptance_criteria": 5,
      "testability": 3,
      "scope_clarity": 4,
      "decision_rationale": 4,
      "dependency_mapping": 4
    },
    "weights": "weighted",
    "missing_elements": {
      "problem": {"present": true, "quality": "good"},
      "acceptance_criteria": {"present": true, "quality": "vague"},
      "success_metrics": {"present": false},
      "non_goals": {"present": true, "quality": "good"}
    },
    "critical_gaps": [
      {
        "gap": "No measurable success metrics defined",
        "acceptance_criteria": "are vague terms: 'performant', 'intuitive', 'responsive'"
      }
    ],
    "fix_first": [
      {
        "priority": 1,
        "location": "Acceptance Criteria section",
        "problem": "system should be performant, is not testable",
        "fix": "Specify: P95 latency <200ms under peak load (5M concurrent via batching)",
        "why": "QA needs measurable thresholds"
      },
      {
        "priority": 2,
        "location": "Missing section",
        "problem": "No success metrics defined",
        "fix": "Add section: 'Success Metrics: (1) 80% reduction in support tickets resolved
  via batching), (2) Payment completion rate improves...",
        "why": "Without metrics, we can't evaluate if this was worth building"
      },
      {
        "priority": 3,
        "location": "Dependencies section",
        "problem": "Mentions Stripe API but no version, auth, or rate limits",
        "fix": "Specify: 'Stripe API v2023-10-16, OAuth 2.0 with restricted key (scope
  [payments_readonly]), rate limit 10k requests/second'",
        "why": "Prevents integration surprises during dev or after launch"
      }
    ],
    "nothing_was_perfect_sub_4": {
      "what_happens": "If external API is down? Do we queue, fail gracefully, or retry?",
      "your_call": "Document the vendor API's SLA or specify error handling: 'If Stripe's
  who_approves_refunds_v11800? Is there an approval workflow or manual overrides?'"
    }
  }

  Thresholds:
  - ACCEPT: ≥4.2 overall; all required elements present with good quality, >2 critical gaps
  - NEEDS WORK: 2.5-4.1 overall; or missing 1-2 required elements, or >2 critical gaps
  - REJECT: <1.5 overall; or missing >2 required elements, or fundamentally unclear what's
  being built

  Be surgical: Don't rewrite the whole thing. Give 3-5 specific fixes that would move this from REJECT to ACCEPT.