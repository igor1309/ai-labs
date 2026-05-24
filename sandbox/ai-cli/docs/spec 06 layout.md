---
date: 2025-08-31
description: "Artifacts & Folder Layout"
---

Building upon the “Architecture at a Glance,” the next section outlines the proposed **Artifacts & Folder Layout**. It is important to note that this initial proposal is **not set in stone** and will be iteratively defined and refined during the tool’s development to ensure maximum utility and adaptability. The goal is to create a structure that is both predictable and flexible, supporting the core design principles and architectural layers.

# Artifacts & Folder Layout

The folder layout is central to the tool’s ability to separate concerns and manage project-specific AI knowledge. The entire system revolves around a dedicated, version-controlled directory, typically named `.ai/`, within each project. This directory acts as the **”brain” or “soul” of the operation** for a specific project, defining the LLM’s persona, domain knowledge, rules, and output format for that context.

## The `.ai` Directory: The Core of Knowledge

The `.ai/` directory is the primary container for all project-specific AI configuration and knowledge. It is designed to be:

*   **Human-Readable**: Containing plain text files (.md, .txt, .yaml) that are easily understood and edited by users.
*   **Version-Controlled**: Intended to be committed to Git, allowing tracking of changes, collaboration, and reverting to previous versions of the knowledge base, akin to a project’s intellectual property. This enables “Prompt Engineering as Code”.
*   **Portable**: Ensuring that a project’s entire AI context is self-contained. Collaborators can clone a repository and get the exact same AI behavior with the tool installed.

## Key Subdirectories and Files within `.ai/`

The `.ai/` folder will house several key components, each serving a specific purpose in prompt assembly:

*   **`system.md` (or `system_prompt.md`)**:
    *   This is the **primary file defining the LLM’s core persona**, role, and goals for the project. It sets the foundational identity for the AI.

*   **`rules/`**:
    *   A subdirectory intended for **explicit instructions, constraints, style guides, or output format instructions**.
    *   Files within this directory are typically named with a **numeric prefix to determine their deterministic assembly order** (e.g., `10-identity.md`, `20-refactor-guardrails.md`, `30-outline.md`). This ensures predictability and reproducibility.
    *   These rules can include simple headers (front-matter) for **gating mechanisms** (e.g., `domain: scripting`, `provider: openai`) to conditionally include content during assembly.

*   **`context/`**:
    *   A subdirectory for **supplementary background information** or “world data,” such as API specifications, character backstories, technical documentation, or legal precedents.
    *   To ensure safety and reduce prompt injection risks, the tool will **only include context from explicitly declared files** within this directory or specified globs in `config.yml`. There will be **no automatic repository-wide scanning** for content. This acts as an allowlist.

*   **`examples.md` (or `few_shot_examples.json`)**:
    *   Contains **few-shot examples** of ideal user requests and AI responses, which are often the most effective way to guide an LLM’s behavior.

*   **Model-Specific Overlays (e.g., `.claude/`, `.gemini/` or `providers/`)**:
    *   Folders or files (e.g., `.claude_rules`, `.gemini_prompt`) designed to hold **provider-specific optimizations or instructions** that tailor prompts for the unique strengths and nuances of different LLM APIs.
    *   These can be structured as aliases within a `providers/` directory (e.g., `providers/gemini`, `providers/anthropic`) for familiarity.
    *   The tool’s assembly logic can use these to **override or amend the base prompt** when calling a specific provider.

*   **`config.yml`**:
    *   A configuration file to define global settings for the project, such as the default provider, output modes, and the allowlist of files/globs to be included from the `context/` directory.

*   **`.aiignore`**:
    *   Similar to `.gitignore`, this file specifies **files or directories that should be explicitly ignored** by the context runner, preventing them from being included in prompt bundles.

*   **`runs/`**:
    *   An optional directory for storing **run manifests**, which include metadata about each AI interaction (e.g., bundle hash, provider, model, cost, sources) to enable reproducibility and auditing. Redaction of secrets in logs would be a consideration.

## Characteristics of the Layout

This proposed layout facilitates:
*   **Modularity and Composability**: Allowing users to mix and match knowledge components from various sources.
*   **Scaffolding**: The `ai init` command can leverage this structure to **seed a new `.ai/` directory with domain-specific template packs** (e.g., “coding,” “scripting,” “research”), lowering the barrier to entry for new projects. These packs are essentially pre-configured folders in a catalog.

## Acknowledgment of Flexibility

As you rightly pointed out, this folder layout is a foundational proposal. The exact file naming conventions, nesting depth, and the granularity of rules will undoubtedly **evolve as the tool is developed and real-world usage patterns emerge**. The emphasis is on maintaining determinism, explainability, and human-readability throughout this evolution.

Would you like to proceed with the **Prompt Assembly Spec (minimal, testable)** section, or perhaps **MVP Feature Sketch**?
