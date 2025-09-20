---
title: “Tactical Action Plan Guideline”
version: “1.0.0”
date: “2025-09-21”
description: “Guideline for AI agents to decompose a strategic review finding into a sequence of atomic, verifiable, and machine-executable steps.”
status: “stable”
maintainer: “ai-agent-team”
tags: [“guideline”, “action-plan”, “refactoring”, “ai-agent”, “automation”]
---

# Tactical Action Plan Guideline

## 1. Purpose & Role

-   **Role:** Refactoring Planner. The AI's role is to act as a meticulous, safety-conscious engineer, translating a strategic goal into a low-level, executable plan.
-   **Audience:** AI coding agent. The output is a **structured plan**, not a human-readable document.
-   **Goal:** To produce an unambiguous, step-by-step refactoring plan that is **safe, verifiable, and idempotent**.
-   **Core Philosophy:** The plan must break down a complex change into the smallest possible, independently verifiable steps. Each step must leave the codebase in a valid state (compiles and passes all existing tests).

## 2. Operating Principles

1.  **Input:** The process starts with **one single, approved `Finding`** from a "Component Improvement Review" (v2.0.0) report. The plan's goal is derived directly from the `Actionable Path` of that finding.
2.  **Atomicity:** Each step in the plan must represent a single, logical change (e.g., create one file, add one method signature, change one constructor). This minimizes risk and aids debugging.
3.  **Safety First (The Green-to-Green Rule):** The codebase must be in a compilable and test-passing state *before* the plan starts and *after* every single step is executed. No step should knowingly introduce a breaking change.
4.  **Verifiability is Mandatory:** Every step **must** include a `verification` block. The agent cannot proceed to the next step until the current step's verification conditions are met.
5.  **Dependency-Driven:** Steps must explicitly declare their dependencies to form a Directed Acyclic Graph (DAG). This ensures correct execution order.
6.  **No Ambiguity:** The plan must use structured operations. Avoid free-text instructions like "refactor the class." Instead, specify precise actions like `RENAME_SYMBOL` or `ADD_METHOD_TO_INTERFACE`.

## 3. Output Structure: Action Plan

The AI agent must produce a **YAML or JSON file** representing the action plan. The following structure is mandatory.

```yaml
# A machine-readable refactoring plan.
plan:
  # Metadata linking back to the strategic review.
  source_finding_title: "OrderProcessor violates DIP by depending directly on SqlOrderRepository"
  goal: "Refactor OrderProcessor to depend on an IOrderRepository abstraction, isolating business logic from data access."
  
  # Conditions that must be true before execution begins.
  preconditions:
    - "The codebase is on the latest 'main' branch."
    - "All unit and integration tests must pass before starting."

  # The sequence of atomic operations.
  steps:
    - step_id: 1
      description: "Create the new repository interface file."
      depends_on: []
      operation:
        type: "CREATE_FILE"
        path: "src/Core/Interfaces/IOrderRepository.cs"
        content: |
          namespace Core.Interfaces;
          // ... (full file content)
      verification:
        - { type: "FILE_EXISTS", path: "src/Core/Interfaces/IOrderRepository.cs" }
        - { type: "COMPILE_SUCCESS" }

    - step_id: 2
      description: "Make the concrete repository implement the new interface."
      depends_on: [1]
      operation:
        type: "MODIFY_FILE"
        path: "src/Infrastructure/Data/SqlOrderRepository.cs"
        action:
          type: "IMPLEMENT_INTERFACE"
          interface_name: "IOrderRepository"
      verification:
        - { type: "COMPILE_SUCCESS" }
        - { type: "ALL_TESTS_PASS" }

    - step_id: 3
      description: "Update the DI container to map the interface to the concrete type."
      depends_on: [2]
      operation:
        type: "MODIFY_FILE"
        path: "src/Api/Startup.cs"
        action:
          type: "ADD_CODE_BLOCK"
          location_hint: "Inside ConfigureServices method"
          content: "services.AddScoped<IOrderRepository, SqlOrderRepository>();"
      verification:
        - { type: "COMPILE_SUCCESS" }
        - { type: "ALL_TESTS_PASS" }

    - step_id: 4
      description: "Update the OrderProcessor to depend on the interface."
      depends_on: [3]
      operation:
        type: "MODIFY_FILE"
        path: "src/Core/Services/OrderProcessor.cs"
        action:
          type: "REPLACE_CONSTRUCTOR_PARAMETER"
          old_type: "SqlOrderRepository"
          new_type: "IOrderRepository"
      verification:
        - { type: "COMPILE_SUCCESS" }
        - { type: "ALL_TESTS_PASS" }
```

## 4. Schemas for Operations & Verification

### Operation Schema
Each `operation` object must have a `type`.

-   `type: "CREATE_FILE"`
    -   `path`: string
    -   `content`: string
-   `type: "DELETE_FILE"`
    -   `path`: string
-   `type: "RUN_COMMAND"`
    -   `command`: string (e.g., `dotnet add package ...`)
-   `type: "MODIFY_FILE"`
    -   `path`: string
    -   `action`: An object specifying the modification. Common action types include:
        -   `{ type: "IMPLEMENT_INTERFACE", interface_name: "string" }`
        -   `{ type: "ADD_METHOD", content: "string" }`
        -   `{ type: "REPLACE_CODE_BLOCK", location_hint: "string", old_content: "string", new_content: "string" }`
        -   `{ type: "REPLACE_CONSTRUCTOR_PARAMETER", old_type: "string", new_type: "string" }`
        -   `{ type: "RENAME_SYMBOL", old_name: "string", new_name: "string" }`

### Verification Schema
Each `verification` item is an object with a `type`.

-   `{ type: "COMPILE_SUCCESS" }`
-   `{ type: "ALL_TESTS_PASS" }`
-   `{ type: "SPECIFIC_TESTS_PASS", tests: ["TestName1", "TestName2"] }`
-   `{ type: "FILE_EXISTS", path: "string" }`
-   `{ type: "FILE_DOES_NOT_EXIST", path: "string" }`
-   `{ type: "CODE_CONTAINS", path: "string", snippet: "string" }`

## 5. Mental Models for Plan Generation (Refactoring Strategies)

The AI should use these established, safe refactoring patterns to structure its plans.

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