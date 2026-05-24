---
date: 2025-08-31
description: "MVP Feature Sketch"
---

Following the “Artifacts & Folder Layout” section, the **MVP Feature Sketch** outlines the essential functionalities the CLI wrapper will offer in its initial release. This sketch focuses on delivering the core value proposition of a predictable, transparent, and modular system, directly addressing key pain points for advanced LLM API users.

# MVP Feature Sketch

The Minimum Viable Product (MVP) of the AI Context Runner will concentrate on its core responsibilities: loading configuration, assembling prompts deterministically, normalizing API requests, and presenting outputs clearly.

## 1. Configuration Precedence
The tool will implement a **git-style hierarchical configuration precedence** for loading its settings and knowledge:
*   **Project-specific `.ai/` folder**: This is the primary source of configuration, allowing for AI behavior tailored to the current project.
*   **Nearest parent `.ai/` folder**: The tool will look up the directory tree if a configuration is not found locally.
*   **User-global `~/.ai/` folder**: Personal templates and preferences are stored here, acting as a fallback.
*   **Built-in defaults**: The ultimate fallback for any unconfigured settings.

## 2. Domain Packs and Initialization
The `ai init` command will be a cornerstone feature, enabling users to **quickly set up new projects with pre-configured AI templates**.
*   Users can choose a **domain pack** (e.g., “coding,” “scripting,” “research,” or “blank”).
*   This command will **seed the new `.ai/` directory** with relevant base system prompts, common rules, example workflows, and domain-specific context patterns, lowering the barrier to entry.
*   Domain packs are essentially pre-configured folders in a catalog, allowing for community contributions and easy sharing.
*   The `ai domain add <name>` command will allow users to merge additional domain packs into an existing `.ai/` directory.

## 3. Prompt Assembly and Explainability
The tool’s Assembly Layer is crucial for intelligently composing knowledge into a system prompt bundle.
*   **`ai run “your prompt”`**: This command will execute the core functionality, assembling the prompt based on project context, sending it to the chosen LLM, and streaming the response.
*   **Deterministic Assembly**: The process will be predictable and reproducible, ensuring that the same inputs always yield the same bundle hash.
    *   The assembly order will be clearly defined: `system.md` first, then domain pack rules (in numeric order), then provider overlay (for the chosen provider), then project rules (in numeric order), and finally, explicitly allowlisted `context/` files.
*   **Gating Mechanisms**: Rule files can include simple headers (front-matter like `domain: scripting`, `provider: openai`) to conditionally include content during assembly, preventing “AI magic” merging.
*   **`ai explain`**: This feature provides **transparency into the prompt assembly process**. It will print the exact assembled bundle, its constituent files, their origins, and token counts, fostering trust and aiding debugging.

## 4. Provider Adapters and Normalization
The MVP will aim to **normalize differences between various LLM APIs** (OpenAI, Anthropic, Gemini).
*   It will use **one internal request schema** (e.g., `{model, temperature, max_output, system, messages, tools?, format?}`) that is mapped to provider-specific requirements.
*   This allows users to **switch between providers without rewriting their prompts or configurations**.
*   **Model-specific overlays** (e.g., `.claude/`, `.gemini/` folders or `providers/` directory) will allow tailoring instructions for the unique strengths and nuances of different LLM APIs.

## 5. API Key Management
The tool will securely manage API keys to protect user credentials.
*   It will primarily read API keys from **environment variables** (e.g., `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` or `GOOGLE_API_KEY`).
*   Optionally, it will support reading keys from a secure configuration file (e.g., `~/.ai/keys.env` or an OS keychain).

## 6. Output Modes
The tool will provide user-friendly output in the terminal.
*   **Streaming responses**: Output will be printed token-by-token as it’s generated for a more interactive experience.
*   **Formatting**: Features like **syntax highlighting for code blocks** and Markdown rendering will improve readability in the terminal.
*   **`—json` and `—file out.md` flags**: For structured tasks or reports, users can direct output to a file in a specific format.

## 7. Run Manifests and Reproducibility
The tool will support storing metadata about each AI interaction to enable reproducibility and auditing.
*   An optional `runs/` directory will store **run manifests**, including the bundle hash, provider, model used, cost, and sources.
*   **Redaction of secrets** in logs will be a consideration for privacy.

## 8. CLI Surface (v1)
The initial set of commands will be small and memorable, focusing on core interactions:
*   **`ai init`**: Create a new `.ai/` directory interactively, choosing a domain.
*   **`ai run “your prompt”`**: Execute the prompt, with flags for provider, model, JSON output, or file output.
*   **`ai explain`**: Show the exact assembled prompt bundle, including files, token sizes, and hash.
*   **`ai domain add <name>`**: Add or refresh domain templates.
*   **`ai doctor`**: Check API keys, reachability, and provide token estimates.
*   **`ai cache clear`**: Clear compiled bundles or fingerprints.

## 9. Trust & Safety (Practical Guardrails)
To mitigate prompt injection risks and ensure trust, the MVP will adhere to strict context inclusion rules:
*   **No automatic repository-wide scanning**: The tool will **only include context from explicitly declared files** within the `context/` directory or specified globs in `config.yml`. This acts as an allowlist.
*   The `.aiignore` file will specify files or directories to be explicitly ignored.

## 10. Deliberate Non-Goals (for V1)
To maintain focus and deliver a stable core, the MVP will **deliberately exclude** certain advanced functionalities:
*   **No autonomous agents, Retrieval-Augmented Generation (RAG), or code execution by default**. These are considered opt-in later features.
*   No heuristic repository scans or “AI magic” merging.
*   No opinionated UI beyond clean terminal streaming and basic file interactions.

Would you like to proceed with the **Governance & Growth of the Knowledge Base** section, or perhaps **Security, Trust, and Privacy**?
