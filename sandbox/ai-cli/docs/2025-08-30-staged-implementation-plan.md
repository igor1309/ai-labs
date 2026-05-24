---
date: 2025-08-31
description: "Solo-developer-friendly staged rollout from bare-bones CLI wrapper through context-aware assembly."
---

# Staged Implementation Plan

For a solo developer with a full-time job, a staged implementation plan is crucial to build the proposed system incrementally, focusing on core value in each phase and deferring complex features. This plan prioritizes getting a functional version out quickly, allowing for continuous iteration and learning.

Here is a staged implementation plan:

## Stage 1: The Bare-Bones CLI Wrapper (Core Tool Layer MVP)

**Goal:** Replace clunky raw API calls with a simple, user-friendly command-line interface for basic LLM interaction.

*   **Project Setup:**
    *   Choose a programming language (e.g., Python or Go as mentioned in sources).
    *   Set up a basic project structure and version control (like Git).
*   **API Key Management:**
    *   Implement secure retrieval of API keys from **environment variables** (e.g., `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`) as the de facto pattern.
    *   Initially, do not ask for keys in the terminal, just read from environment variables.
*   **Basic API Request/Response:**
    *   Implement **sending a simple text prompt** to at least one LLM provider (e.g., OpenAI, Anthropic, or Gemini).
    *   Handle the basic HTTP request/response cycle.
    *   **Stream the output** to the terminal by default, so the user isn't waiting for a large block of text.
    *   Present the output as plain text initially.
*   **Basic User Input:**
    *   Allow the script to take **user input as a command-line argument** (e.g., `ai run "Your question here"`).
    *   This fulfills the fundamental purpose of the tool.

## Stage 2: Local Project Configuration (Foundation of Knowledge Layer)

**Goal:** Introduce project-specific AI behavior and the `.ai` folder as a first-class citizen.

*   **`.ai` Folder Introduction:**
    *   Implement logic to look for a hidden directory named `.ai/` in the current working directory.
    *   If found, read a specific file, e.g., `.ai/system_prompt.md`, to get the **LLM's system prompt**.
*   **Hierarchical Configuration (Local First):**
    *   Implement a **local-first fallback chain**: project-specific `.ai/system_prompt.md` takes precedence. If not found, fall back to a built-in default system prompt (or a global user configuration, to be added later).
    *   Clearly define the interaction rules (e.g., additive, overriding) for different configuration layers.
    *   This introduces "project-specific personalities" for the LLM.
*   **`ai init` Command (Blank Template):**
    *   Add an `ai init` command that, when run in a directory without an `.ai` folder, creates a **basic, empty `.ai/` folder with a default `system_prompt.md` file**. This lowers the barrier to entry.
*   **Basic Prompt Composition:**
    *   The wrapper should compose the API request by combining the system prompt (from `.ai/system_prompt.md` or default) with the user's input.

## Stage 3: Modular Knowledge & Deterministic Assembly (Expanding Knowledge & Assembly Layers)

**Goal:** Enable modular prompt engineering, domain-specific templates, and transparency in prompt construction.

*   **`rules/` Directory:**
    *   Introduce a convention for a `rules/` subdirectory within `.ai/` (e.g., `.ai/rules/`).
    *   Implement **deterministic assembly logic**: concatenate files from `rules/` (e.g., in lexical/numeric order) to refine the system prompt.
    *   This allows for **composable prompt engineering**.
*   **Domain Packs & `ai init --domain`:**
    *   Expand `ai init` to accept a `--domain` flag (e.g., `ai init --domain scripting` or `ai init --domain coding`).
    *   When a domain is specified, the tool should **copy a set of relevant template files** (domain pack) into the `.ai/` folder (e.g., `rules/10-character.md`, `rules/20-beats.md` for scripting).
    *   These domain packs represent reusable, curated knowledge for specific use cases.
    *   Allow users to define and share their own custom domain packs.
*   **`ai explain` Command:**
    *   Implement an `ai explain` command that **prints the exact assembled prompt bundle**, including file origins and token counts. This provides transparency and aids debugging.

## Stage 4: Multi-Provider Support & Enhanced UX (Tool Layer Refinement)

**Goal:** Abstract away LLM provider differences and improve terminal experience.

*   **Provider Abstraction Layer (Adapter Layer):**
    *   Create an internal **normalized request schema** (e.g., `{model, temperature, max_output, system, messages, tools?, format?}`).
    *   Implement **adapters** that translate this internal schema into the provider-specific API calls (OpenAI's chat completions, Anthropic's messages API, Gemini's generate content).
    *   This means the user doesn't need to remember per-provider quirks.
*   **Model-Specific Overlays:**
    *   Introduce support for **model-specific configuration files or folders** (e.g., `.ai/providers/openai/overlay.md`, `.ai/providers/anthropic/overlay.md`, or the earlier `.gemini`, `.claude` folder idea).
    *   These files should be applied during assembly *only for the chosen provider*, allowing for tailored instructions.
    *   Clearly define how these overlays interact with the main system prompt and other rules (e.g., append, prepend, override).
*   **Enhanced Output Formatting:**
    *   Improve presentation by applying **Markdown rendering and syntax highlighting** for code blocks in the terminal.
*   **Global Configuration:**
    *   Add support for a **global configuration file** (e.g., `~/.ai/`) for user's personal templates and preferences, which acts as a fallback if no project `.ai/` folder is present or specific rules aren't found locally.

## Stage 5: Context and Performance (Advanced Assembly & Knowledge Management)

**Goal:** Integrate project context intelligently and optimize for token limits and costs.

*   **Context Scanning (Allowlist-based):**
    *   Implement a `context/` directory within `.ai/` (e.g., `.ai/context/`).
    *   Crucially, **do not automatically slurp all files** from the repo. Instead, use an **explicit allowlist** in a `config.yml` (e.g., `.ai/config.yml`) to specify which files or globs from `context/` should be included.
    *   This approach is safer and reduces prompt-injection risk.
*   **Token Budget Awareness:**
    *   Implement basic token counting for the assembled prompt bundle.
    *   Provide **warnings** if the prompt approaches or exceeds the LLM's token limit.
    *   Implement strategies for handling token limits (e.g., intelligent truncation, summarization, or prompting the user to refine input).
*   **Prompt Caching:**
    *   Implement a **bundle cache** where the hash of the assembled files is used to reuse prompt bundles across runs. This can save costs and latency, especially with providers that support prompt caching.
*   **`config.yml` for Assembly Rules:**
    *   Formalize assembly rules (precedence, composition logic) within a `config.yml` file inside the `.ai/` folder, allowing for user control over how knowledge pieces are merged. This allows for more sophisticated merging than simple append.

This staged plan ensures that the solo developer can deliver tangible value at each step, building a robust and sophisticated tool piece by piece, while managing the project effectively alongside other commitments. Each stage addresses a core pain point and incrementally moves towards the ambitious vision of a domain-agnostic AI context runner.

## Cross-Cutting Concerns

*   **Integrated Testing:** Implement unit and integration tests at each stage to ensure the reliability and correctness of new features and refactorings.
*   **User-Facing Documentation:** Develop clear and concise user documentation alongside feature development, including examples and usage instructions for each new command and configuration option.
*   **Security Best Practices:** Continuously review and apply security best practices throughout development, including prompt injection mitigation, secure data handling, and API key protection.
