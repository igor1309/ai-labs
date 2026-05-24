The AI Context Runner’s Minimum Viable Product (V1) is designed with a clear focus on its core responsibilities, deliberately **excluding certain advanced functionalities** to ensure stability, security, and a predictable user experience. This approach allows the tool to remain **minimalist and domain-agnostic** in its initial release.

The deliberate non-goals for V1 include:

*   **No autonomous agents, Retrieval-Augmented Generation (RAG), or code execution by default**. These are considered **opt-in later features** that would require careful implementation due to their inherent security and trust complexities. The tool’s primary goal is to assemble context and normalize requests, not to act as an autonomous agent.
*   **No heuristic repository scans or “AI magic” merging**. This decision reinforces a strict **allowlist-only approach** for context inclusion, preventing unpredictable context integration and mitigating prompt injection risks. The tool will **not automatically scan repository-wide** for content, ensuring that only explicitly declared files are included.
*   **No opinionated User Interface (UI) beyond clean terminal streaming and basic file interactions**. The focus is on a predictable, git-like Command-Line Interface (CLI) experience.
*   The tool **ships with zero domain content in its binary**. Its core functionality remains lean and stable, relying on shareable domain packs for specific knowledge.

By excluding these features in V1, the project aims to deliver a **stable, secure core**, maintain focus, and ensure the tool is **boring, predictable, and domain-agnostic**. This allows knowledge (prompts and rules) to evolve independently of the tool’s core functionality.