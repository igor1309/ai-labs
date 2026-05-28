---
date: 2025-08-31
description: "Core Idea"
---

# Core Idea

The core concept behind this product is to provide a **boring, predictable, git-like Command-Line Interface (CLI) tool** that fundamentally separates three distinct concerns when interacting with Large Language Model (LLM) APIs. This approach aims to transform raw LLM APIs into a powerful, integrated, and highly configurable developer assistant by abstracting the “engine” from the “instructions”.

The tool functions as a **domain-agnostic “AI Context Runner”**, acting as an expert at discovering and parsing specific directory structures, assembling final prompts, managing API credentials, and presenting results. It is designed to be neutral and minimal, without inherent domain knowledge shipped within the binary.

This system is built upon three main layers:

1.  **The Tool Layer (Plumbing):** This layer represents the **stable, domain-agnostic infrastructure**. Its responsibilities are purely technical and include commodity tasks such as:
    *   **Authentication** and secure management of API keys (e.g., from environment variables or a global config file).
    *   **Model selection and parameter tuning** (e.g., temperature, max tokens).
    *   **Request formatting** and API communication (composing JSON payloads, handling headers, error handling, rate limiting).
    *   **Output presentation** (streaming responses, syntax highlighting for code blocks, Markdown rendering).
    *   Optionally, **state management** for short-term conversation history.
    *   Scaffolding capabilities, such as `ai init` to create a template `.ai` directory.
    The key feature of this layer is its **stability and independence from domain content**.

2.  **The Knowledge Layer (Valuable Content):** This layer comprises the **curated prompts, domain expertise, personal workflows, and specific rules** that define the AI’s behavior for a given project or task. This is where the **real value, differentiation, and intellectual property** reside. It lives in human-readable files within project-specific `.ai` folders, making it easily version-controlled using systems like Git. Key components include:
    *   The **persona** (e.g., `system_prompt.md` defining the LLM’s identity and role).
    *   **”World” data** (supplementary files like character sheets, technical specifications, API documentation).
    *   **Constraints and rules** (explicit instructions on format, style, or “do not” rules).
    *   **Examples** (few-shot prompts for ideal interactions).
    *   **Model-specific overrides** (e.g., in `.claude` or `.gemini` folders) to tailor instructions for the nuances of different LLM providers.
    This layer is **volatile, highly domain-specific**, and represents the accumulated expertise of the user.

3.  **The Assembly Layer (Intelligent Glue):** This is the **deterministic logic** that intelligently composes all the knowledge pieces into a single, effective system prompt bundle for the LLM API. It acts as a “contract” that the Tool understands, defining how to build the final prompt from files in the `.ai` folder. This layer defines:
    *   **Precedence rules** for resolving conflicts between local, global, and model-specific configurations.
    *   **Composition logic** for merging multiple rule sets (e.g., append, override, selective merge).
    *   How to manage **context within token limits**.
    *   **Dependency handling** between rule sets.
    *   **Deterministic assembly order** (e.g., `system.md` first, then domain pack rules, then provider overlay, then project rules, then context).
    *   **Gating mechanisms** using simple headers in rule files (e.g., `domain: scripting`, `provider: openai`) to conditionally include content.
    This layer ensures **transparency and reproducibility** through features like `ai explain` to show the exact assembled bundle, its constituent files, origins, and token counts.

By implementing this clear separation, the tool aims to:
*   Enable **reproducible AI interactions** with transparent provenance.
*   Allow **knowledge (prompts and rules) to evolve independently** of the tool’s core functionality.
*   **Normalize differences between various LLM APIs** (OpenAI, Anthropic, Gemini) so users can switch providers without rewriting configurations.
*   Significantly **reduce prompt engineering overhead** and improve the quality of AI interactions.
*   Foster a **community-driven ecosystem** where domain-specific template packs can be shared and customized.
*   Provide a workflow where “prompting” is treated as a **core, version-controlled component** of a project’s intellectual property, similar to Git, Docker, or VS Code’s project settings.
