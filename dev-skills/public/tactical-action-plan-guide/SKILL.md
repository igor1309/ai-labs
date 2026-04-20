---
name: tactical-action-plan-guide
version: "1.0.0"
author: Igor Malyarov
description: Use when an approved review finding needs a safe, dependency-aware implementation plan that keeps the codebase working after every step.
---

# Tactical Action Plan Guideline

## 1. Purpose & Role

-   **Role:** Refactoring Planner. The AI's role is to act as a meticulous, safety-conscious engineer, translating a strategic goal into a low-level, executable plan.
-   **Audience:** AI coding agent. The output is a **structured plan**, not a human-readable document.
-   **Goal:** To produce an unambiguous, step-by-step refactoring plan that is **safe, verifiable, and idempotent**.
-   **Core Philosophy:** The plan must break down a complex change into the smallest possible, independently verifiable steps. Each step must leave the codebase in a valid state before the next step begins.

## 2. Operating Principles

1.  **Input:** The process starts with **one single, approved `Finding`** from a "Component Improvement Review" (v2.0.0) report. The plan's goal is derived directly from the `Actionable Path` of that finding.
2.  **Atomicity:** Each step in the plan must represent a single, logical change (e.g., create one file, add one method signature, change one constructor). This minimizes risk and aids debugging.
3.  **Safety First (The Green-to-Green Rule):** The codebase must remain in a valid, working state after every step. This is the **Green-to-Green Rule**. This rule is verified by an automated test suite. **Crucially, if the `preconditions` reveal no adequate test suite exists, the first objective of the plan *must* be to establish a high-level characterization test.** This test acts as a safety harness by capturing the component's current behavior, including any existing bugs. All subsequent refactoring steps must ensure this harness test continues to pass.
4.  **Verifiability is Mandatory:** Every step **must** include a `verification` block. The agent cannot proceed to the next step until the current step's verification conditions are met.
5.  **Dependency-Driven:** Steps must explicitly declare their dependencies to form a Directed Acyclic Graph (DAG). This ensures correct execution order.
6.  **No Ambiguity:** The plan must use structured operations. Avoid free-text instructions like "refactor the class." Instead, specify precise actions like `RENAME_SYMBOL` or `ADD_METHOD`.

## 3. Output Structure: Action Plan

The AI agent must produce a **machine-readable action plan** in YAML or JSON. The following structure is mandatory.

```yaml
# A machine-readable refactoring plan.
plan:
  # Metadata linking back to the strategic review.
  source_finding_title: "OrderProcessor violates DIP by depending directly on SqlOrderRepository"
  goal: "Refactor OrderProcessor to depend on an IOrderRepository abstraction, isolating business logic from data access."
  
  # Conditions that must be true before execution begins.
  preconditions:
    - "The codebase is on the latest 'main' branch."
    - "All unit and integration tests must pass before starting. (If no tests exist, this is a critical finding to be addressed in step 1)."

  # The sequence of atomic operations.
  steps:
    - step_id: 1
      description: "Create a characterization test to provide a safety harness."
      operation:
        type: "CREATE_FILE"
        target: "Tests/OrderProcessorCharacterizationTests.*"
      # ... this step would only be present if no tests exist ...
      verification:
        - { type: "ALL_TESTS_PASS" }

    # ... subsequent refactoring steps ...
```

## 4. Schemas for Operations & Verification

Use a closed set of operation and verification shapes. Do not fall back to vague instructions.

### Operation schema

Each step should describe one primary operation. Use the smallest operation that keeps the plan unambiguous.

```yaml
operation:
  type: "CREATE_FILE" | "ADD_TYPE" | "ADD_METHOD" | "ADD_PARAMETER" | "RENAME_SYMBOL" | "MOVE_CODE" | "UPDATE_CALL_SITE" | "UPDATE_COMPOSITION_ROOT" | "DELETE_OLD_CODE"
  target: "Path, symbol, or module being changed"
  details:
    # Operation-specific structured fields only
```

Use these operation types as follows:

-   `CREATE_FILE`: Introduce a new source or test file.
-   `ADD_TYPE`: Add a protocol, interface, class, struct, or enum.
-   `ADD_METHOD`: Add one method, function, or initializer signature.
-   `ADD_PARAMETER`: Extend an existing API without changing unrelated behavior.
-   `RENAME_SYMBOL`: Rename one type, method, property, or variable.
-   `MOVE_CODE`: Relocate one responsibility from one type or file to another.
-   `UPDATE_CALL_SITE`: Update one consumer or one cluster of equivalent call sites.
-   `UPDATE_COMPOSITION_ROOT`: Change dependency wiring, registration, or factory setup.
-   `DELETE_OLD_CODE`: Remove superseded code only after callers and tests are updated.

### Verification schema

Every step must include at least one verification entry.

```yaml
verification:
  - type: "TEST_TARGET_PASSES" | "ALL_TESTS_PASS" | "BUILDS" | "LINTS" | "SYMBOL_EXISTS" | "SYMBOL_REMOVED" | "CALL_SITE_COUNT_MATCHES"
    target: "Optional target, suite, symbol, or file"
    notes: "Optional constraint or expected observation"
```

Use these verification types as follows:

-   `TEST_TARGET_PASSES`: Run the smallest relevant suite that proves the step.
-   `ALL_TESTS_PASS`: Use when the step changes shared contracts, wiring, or broad behavior.
-   `BUILDS`: Verify the codebase compiles after signature or composition changes.
-   `LINTS`: Verify formatting or static checks when the repo enforces them.
-   `SYMBOL_EXISTS`: Confirm a new abstraction, method, or file is present.
-   `SYMBOL_REMOVED`: Confirm obsolete code is gone only after replacement is live.
-   `CALL_SITE_COUNT_MATCHES`: Confirm all intended consumers have been migrated.

### Dependency rules

-   `depends_on` may only reference earlier `step_id` values.
-   A step with no prerequisites must omit `depends_on` or use an empty list.
-   If a step cannot be safely verified in isolation, the plan is under-decomposed and must be split further.

## 5. Mental Models for Plan Generation (Refactoring Strategies)

The AI should use these established, safe refactoring patterns to structure its plans. **The chosen model must respect the state of the existing test suite.**

-   **Establish Safety Harness (Characterization Test) - PRIORITY 0:**
    -   **When to use:** This pattern is **mandatory** as the first phase of any plan if the component to be refactored lacks adequate test coverage.
    -   **Steps:**
        1.  Create a new test file and install a testing framework if necessary.
        2.  Write a high-level, end-to-end, or "black box" test that executes the component.
        3.  Provide known inputs and capture the exact, literal output (e.g., using snapshot testing or by asserting against a golden master file).
        4.  This test does not judge correctness; it only **characterizes the current behavior**.
        5.  Once this test is in place and passing, it becomes the primary `verification` for all subsequent refactoring steps.

-   **Introduce Abstraction (Most Common):**
    1.  Create the new abstraction (interface).
    2.  Make the concrete class implement the abstraction *without changing any method signatures*.
    3.  Update the Dependency Injection container or Factory to map the abstraction to the concrete class.
    4.  Finally, change the consumer class to depend on the abstraction.
    5.  Run tests after each step.

-   **Branch by Abstraction (For Risky, Large-Scale Changes):**
    1.  Introduce an abstraction that fronts the old implementation.
    2.  Create the new implementation of the abstraction.
    3.  Use a feature flag or configuration to control which implementation is used.
    4.  Once the new implementation is verified in production, remove the old implementation and the feature flag.

-   **Extract Class/Method:**
    1.  Create the new class/method.
    2.  Copy the relevant code from the old location to the new one.
    3.  Replace the old code with a call to the new location.
    4.  Test.
    5.  Remove the old code once all callers are updated (if applicable).

## 6. Definition of Done

A generated plan is considered "Done" only when it meets all these criteria:

-   [ ] **Traceability:** The plan is explicitly linked to a `source_finding_title` from a v2.0.0 review.
-   [ ] **Completeness:** The sequence of steps logically achieves the stated `goal`.
-   [ ] **Atomicity:** The plan is fully decomposed into the smallest viable steps.
-   [ ] **Safety:** The plan is structured to ensure tests are passing after every step.
-   [ ] **Verification:** Every single step has a non-empty `verification` block.
-   [ ] **Valid Graph:** The `depends_on` graph is valid and contains no circular dependencies.
-   [ ] **Initial State Awareness:** The plan correctly identifies the initial test state and, if necessary, includes steps to create a characterization test harness before proceeding with refactoring.
