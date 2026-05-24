---
date: 2025-08-31
description: "Architecture at a Glance"
---

# Architecture at a Glance

The proposed CLI wrapper for LLM APIs is structured into distinct layers and adheres to a clear contract, ensuring a **predictable, transparent, and modular system**.

**Layers**:

1.  **Tool Layer (Plumbing):** This is the **stable, domain-agnostic infrastructure**. Its primary responsibilities are purely technical and include:
    *   **Authentication** and secure management of API keys.
    *   **Model selection and parameter tuning** (e.g., temperature, max tokens).
    *   **Request formatting** and API communication, including handling JSON payloads, headers, error handling, and rate limiting.
    *   **Output presentation** with features like streaming responses, syntax highlighting for code blocks, and Markdown rendering.
    *   Optionally, **state management** for short-term conversation history.
    *   Scaffolding capabilities, such as `ai init` to create a template `.ai` directory.
    *   It acts as a **neutral execution engine without inherent domain knowledge**.

2.  **Knowledge Layer (Valuable Content):** This layer comprises the **curated prompts, domain expertise, personal workflows, and specific rules** that define the AI’s behavior for a given project or task. This is where the **real value, differentiation, and intellectual property** reside. It is stored in human-readable files within project-specific `.ai` folders, making it **easily version-controlled using systems like Git**. Key components include:
    *   The **persona** (e.g., `system_prompt.md` defining the LLM’s identity and role).
    *   **”World” data** (supplementary files like character sheets, technical specifications, API documentation).
    *   **Constraints and rules** (explicit instructions on format, style, or “do not” rules).
    *   **Examples** (few-shot prompts for ideal interactions).
    *   **Model-specific overrides** (e.g., in `.claude` or `.gemini` folders) to tailor instructions for different LLM providers.
    *   This layer is **volatile, highly domain-specific**, and represents the accumulated expertise of the user.

3.  **Assembly Layer (Intelligent Glue):** This is the **deterministic logic** that intelligently composes all the knowledge pieces into a single, effective system prompt bundle for the LLM API. It acts as a “contract” that the Tool understands, defining how to build the final prompt from files in the `.ai` folder. This layer defines:
    *   **Precedence rules** for resolving conflicts between local, global, and model-specific configurations.
    *   **Composition logic** for merging multiple rule sets (e.g., append, override, selective merge).
    *   How to manage **context within token limits**.
    *   **Dependency handling** between rule sets.
    *   **Deterministic assembly order** (e.g., `system.md` first, then domain pack rules, then provider overlay, then project rules, then context).
    *   **Gating mechanisms** using simple headers in rule files (e.g., `domain: scripting`, `provider: openai`) to conditionally include content.
    *   This layer ensures **transparency and reproducibility** through features like `ai explain` to show the exact assembled bundle, its constituent files, origins, and token counts.

**Contract**:
The system adheres to a clear contract, which can be summarized as:
`{ provider, model, params, bundle(manifest, system, context, options) }`.

Would you like to proceed with the **Artifacts & Folder Layout** section, or perhaps **Validation in the Ecosystem: Existing Tools**?
