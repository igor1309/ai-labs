#### Pain & Context

Advanced LLM API users frequently encounter **significant friction and inefficiencies** when interacting directly with powerful AI models. While raw LLM APIs from providers like Google, OpenAI, and Anthropic are potent, their direct use from the terminal is often **uncomfortable and clunky** for serious work.

The core challenges and pain points this tool aims to address include:

*   **Manual Prompt Composition and Configuration:** Users are forced into **manual prompt composition and configuration**, which is tedious and error-prone. This includes composing JSON payloads, handling headers, and escaping characters.
*   **Lack of Systematic Knowledge Reuse:** There is **no systematic way to reuse domain expertise, curated prompt knowledge, or learned interaction patterns**. Users repeatedly write the same instructions across various tasks and projects.
*   **Inconsistent Workflows:** It is **difficult to maintain consistent workflows** across different projects, leading to ad-hoc methods and potential inconsistencies.
*   **Manual and Error-Prone Context Management:** **Context management is often manual and error-prone**. Each raw API call is stateless, making follow-up questions challenging without re-submitting the entire conversation history. There’s no facility to automatically include relevant project files (like code, documentation, or lore details) as context.
*   **Unstandardized Organization and Sharing:** There is **no standardized way to organize and share LLM interaction patterns**, making collaboration and the dissemination of best practices difficult.
*   **Insecure Credential Handling:** Raw API usage can involve passing API keys directly on the command line, posing a **security risk**. Secure management of API keys (e.g., via environment variables or a secure configuration file) is a necessity.
*   **Unfriendly Output:** Raw JSON responses from APIs are **not user-friendly** in the terminal, often lacking formatting, streaming, and syntax highlighting for readability.
*   **Conflated Concerns:** Most existing tools tend to **tangle “how to call the model” with “what we tell the model,”** conflating these distinct concerns.
*   **Unclear Provenance and Non-Deterministic Assembly:** It’s often **hard to see which rules or prompt fragments influenced an AI’s answer**, leading to unclear provenance. Ad-hoc concatenation of prompt elements can result in **non-deterministic assembly**, causing drift and inconsistent results over time.
*   **Provider-Specific Portability Risks:** Differences between providers (e.g., OpenAI, Anthropic, Gemini) in terms of roles, JSON modes, and tool formats **leak into prompts**, creating portability issues when switching or using multiple APIs.
*   **High Curation Overhead:** There is **no clean guidance for growing and curating a knowledge base** of prompts and rules over time, increasing overhead.
*   **Repetitive Setup:** Users face **repetitive setup tasks** for API keys, model selection, and various flags for each interaction.
*   **Lack of Flexible System Prompt Management:** Existing tools often lack **flexible, configurable system prompt management**, particularly for handling hierarchical configurations (local to global) and domain-specific rules.