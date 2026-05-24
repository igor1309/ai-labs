---
date: 2025-08-31
description: "How the knowledge layer is curated, versioned, and grown — domain packs, assembly rules, governance practices."
---

# Spec 08 — Governance & Growth of the Knowledge Base

The governance and growth of the AI Context Runner’s knowledge base are central to its design, emphasizing modularity, transparency, and community contribution. The core idea is to separate the stable “Tool Layer” from the evolving “Knowledge Layer,” allowing the latter to be curated, version-controlled, and shared independently.

## The Nature of the Knowledge Layer
The Knowledge Layer is where the **real value, differentiation, and intellectual property** of the AI Context Runner reside. It encompasses **curated prompts, domain expertise, personal workflows, and specific rules** that define the AI’s behavior for a given project or task. This layer is **volatile, highly domain-specific**, and represents the accumulated expertise of the user. It is stored in **human-readable files within project-specific `.ai/` folders**.

## Version Control as a Core Mechanism
A cornerstone of managing and growing the Knowledge Layer is its **integration with version control systems like Git**. This allows prompts and rules to be treated as a **core, version-controlled component of a project’s intellectual property**. Users can **track changes, collaborate with others, and revert to previous versions** of their “knowledge base”. This approach is often referred to as “Prompt Engineering as Code”.

## Domain Packs and a Community-Driven Ecosystem
The growth of the knowledge base is significantly facilitated by **domain packs and scaffolding capabilities**.
*   The `ai init` command is a cornerstone feature, enabling users to **quickly set up new projects with pre-configured AI templates**.
*   Users can choose a **domain pack** (e.g., “coding,” “scripting,” “research,” or “blank”), which then **seeds the new `.ai/` directory** with relevant base system prompts, common rules, example workflows, and domain-specific context patterns, lowering the barrier to entry.
*   Domain packs are essentially **pre-configured folders in a catalog**, fostering a **community-driven ecosystem** where these packs can be **shared and customized**.
*   The `ai domain add <name>` command allows users to **merge additional domain packs** into an existing `.ai/` directory.
*   This strategy ensures that the **tool’s core functionality remains lean and stable**, while **domain-specific knowledge lives in shareable packs** that evolve independently. The tool ships with **zero domain content** in its binary, relying on these separate template packs.

## Rules for Assembly and Curation
**Manageable, composable rules** dictate how templates and context fragments are combined into system prompts. The **Assembly Layer** acts as the deterministic logic for intelligently composing these knowledge pieces. Key aspects include:
*   **Precedence rules** for resolving conflicts between local, global, and model-specific configurations.
*   **Composition logic** for merging multiple rule sets (e.g., append, override, selective merge).
*   **Gating mechanisms** using simple headers (front-matter like `domain: scripting`, `provider: openai`) in rule files to conditionally include content during assembly.
*   Rule files are typically named with a **numeric prefix to determine their deterministic assembly order** (e.g., `10-identity.md`, `20-refactor-guardrails.md`).

To ensure clarity and maintainability of the rules:
*   **Keep each rule file short and single-purpose**.
*   If a rule grows, it should be **split** into more granular files (e.g., `30-guardrails-input`, `31-guardrails-facts`).
*   When two rules conflict, the resolution should be achieved by **renaming or reordering**, rather than relying on hidden precedence.

## Governance Best Practices
For the long-term health, trust, and growth of the knowledge base, several governance practices are proposed:
*   **Version your packs using semantic versioning (semver)** and maintain a **CHANGELOG** with human-readable notes (e.g., “tightened beat vocabulary; added character arc test prompts”).
*   Provide a **compatibility table** to indicate which sections assume which provider features (e.g., strict JSON).
*   Implement a **review cadence** for rules.
*   Maintain **”golden runs” or snapshots** (input → output) for a handful of tasks per domain to detect regressions in tone or structure.
*   For open-sourced packs, a **CONTRIBUTING document** should explain section types, naming conventions, and how to propose changes, with license text living alongside the pack.
*   The framework emphasizes **allowlist-only inclusion** for context files to mitigate prompt injection risks and ensure trust.

## Benefits of this Approach
This structured and governed approach allows **knowledge (prompts and rules) to evolve independently of the tool’s core functionality**. It significantly **reduces prompt engineering overhead** and improves the quality of AI interactions. This design creates a **robust, maintainable framework** that leverages user expertise and invites collaborative growth, while minimizing redundant tooling efforts.
