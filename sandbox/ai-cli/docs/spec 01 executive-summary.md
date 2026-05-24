---
date: 2025-08-31
description: "Executive Summary"
---

# Executive Summary

This product specification outlines a **domain-agnostic Command-Line Interface (CLI) wrapper** designed to address the significant friction and inefficiencies advanced LLM API users face when interacting directly with powerful AI models. Current methods often involve **manual prompt composition, tedious context management, and a lack of systematic ways to reuse domain expertise**, leading to inconsistent results and high overhead.

The core concept is to provide a **boring, predictable, git-like CLI tool** that fundamentally separates three distinct concerns:

*   **The Tool Layer (Plumbing):** This is the **stable, domain-agnostic infrastructure** responsible for commodity tasks such as API key management, model selection, request formatting, rate limiting, and output presentation. It acts as a neutral execution engine, ensuring reliability without inherent domain knowledge.

*   **The Knowledge Layer (Valuable Content):** This layer comprises the **curated prompts, domain expertise, personal workflows, and specific rules** that define the AI’s behavior for a given project or task. Stored in project-specific `.ai` folders (and potentially model-specific overrides like `.claude` or `.gemini`), this is where the **real value, differentiation, and intellectual property** reside. It is designed to be human-readable and easily version-controlled using systems like Git.

*   **The Assembly Layer (Intelligent Glue):** This is the **deterministic logic** that intelligently composes all the knowledge pieces into a single, effective system prompt bundle for the LLM API. It defines **precedence rules, composition logic**, and how to manage context within token limits, ensuring **transparency and reproducibility** through features like `ai explain` to show the exact assembled bundle.

By implementing this clear separation, the tool aims to:

*   Enable **reproducible AI interactions** with transparent provenance.
*   Allow **knowledge (prompts and rules) to evolve independently** of the tool’s core functionality.
*   **Normalize differences between various LLM APIs** (OpenAI, Anthropic, Gemini) so users can switch providers without rewriting their configurations.
*   Significantly **reduce prompt engineering overhead** and improve the quality of AI interactions across diverse domains, from coding to scriptwriting.
*   Foster a **community-driven ecosystem** where domain-specific template packs can be shared and customized, while project-specific knowledge remains private.

This framework transforms raw LLM APIs into a powerful, integrated, and **highly configurable developer assistant**, addressing critical pain points and aligning with best practices in modern developer tooling.
