#### Design Principles

The design of this CLI wrapper for LLM APIs is anchored in several core principles, ensuring it is a robust, predictable, and highly effective tool for advanced users.

*   **Separation of Concerns:** This is fundamental to the tool’s architecture. It clearly separates:
    *   **The Tool Layer (Plumbing):** Responsible for stable, domain-agnostic infrastructure like API key management, model selection, request formatting, and output presentation. It acts as a neutral execution engine without inherent domain knowledge.
    *   **The Knowledge Layer (Valuable Content):** Comprises curated prompts, domain expertise, personal workflows, and specific rules, all stored in human-readable files within project-specific `.ai` folders. This is where the real value and intellectual property reside.
    *   **The Assembly Layer (Intelligent Glue):** This layer defines the deterministic logic for intelligently composing all knowledge pieces into a single, effective system prompt bundle. It handles precedence, composition logic, and context management. This separation allows knowledge to evolve independently of the tool’s core functionality.

*   **Determinism:** The assembly process for prompts must be **predictable and reproducible**. Same inputs should always yield the same bundle hash. This is achieved through numeric ordering and explicit gates, avoiding implicit scans or “AI magic” merging.

*   **Explainability:** Users must have **transparency into the prompt assembly process**. The tool will provide features like `ai explain` to show the exact assembled bundle, its constituent files, their origins, and token counts, fostering trust and enabling debugging.

*   **Minimalism & Domain-Agnosticism (Deliberate Non-Goals for V1):** The tool is designed to be **boring, predictable, and domain-agnostic**. It ships with **zero domain content** in its binary. Its primary goal is to assemble context and normalize requests, not to act as an autonomous agent, perform Retrieval-Augmented Generation (RAG) by default, or execute code. These advanced functionalities are considered opt-in later features.

*   **Portability & Normalization:** The tool aims to **normalize differences between various LLM APIs** (OpenAI, Anthropic, Gemini). It will use one internal request schema that is mapped to provider-specific requirements, allowing users to switch providers without rewriting their configurations.

*   **Safety by Allowlist:** To reduce prompt injection risks and ensure trust, the tool will **only include context from explicitly declared files** within the `context/` directory or specified globs in `config.yml`. There will be **no automatic repository-wide scanning** for content.

*   **Version Control Integration:** Prompts and rules are treated as a core, **version-controlled component** of a project’s intellectual property, similar to Git, Docker, or VS Code settings. This enables tracking changes, collaboration, and reverting to previous versions of the knowledge base.

*   **Community-Driven Ecosystem:** The design fosters a **community-driven ecosystem** where domain-specific template packs can be shared and customized. The tool will support scaffolding (e.g., `ai init`) to easily set up new projects with pre-configured templates.

Would you like to proceed with the **Architecture at a Glance** section, or perhaps **Artifacts & Folder Layout**?