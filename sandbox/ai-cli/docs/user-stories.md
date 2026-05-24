Here are some user stories for an **LLM user who is advanced enough to use an API instead of a chatbot UI**, drawing from the provided sources and our conversation:

*   **As an LLM API user**, I want to **automatically include relevant project files** (like code, documentation, or lore details) as context in my prompts so that the AI has all necessary background information without me manually copying and pasting file contents.

*   **As an LLM API user**, I want to **define project-specific system prompts and rules** in a local `.ai` folder so that the AI’s behavior is precisely tailored to the unique requirements and context of my current project, separate from my global preferences.

*   **As an LLM API user**, I want to **quickly set up new projects with pre-configured AI templates** for specific domains (e.g., “coding”, “scripting”, “research”) so that I can immediately start working with a contextually appropriate AI without manual prompt engineering setup.

*   **As an LLM API user**, I want to **store and reuse my curated prompt knowledge, domain expertise, and specific rules** in a systematic way so that I can consistently apply my best practices across various tasks and projects without repeatedly writing the same instructions.

*   **As an LLM API user**, I want to **define model-specific overrides and instructions** (e.g., in `.claude` or `.gemini` folders) so that I can optimize prompt performance and tailor output for the unique strengths and nuances of different LLM providers.

*   **As an LLM API user**, I want the tool to **securely manage my API keys** (e.g., via environment variables or a secure configuration file) so that I don’t have to repeatedly enter them for every API call and my credentials remain protected.

*   **As an LLM API user**, I want to **see the exact, final system prompt bundle** that will be sent to the API, including its constituent files, their origins, and token counts so that I can debug, audit, and build trust in the tool’s prompt assembly logic.

*   **As an LLM API user**, I want the tool to **normalize differences between various LLM APIs** (e.g., OpenAI, Anthropic, Gemini) so that I can switch between providers or use multiple providers without having to rewrite my prompts or configuration for each one.

*   **As an LLM API user**, I want to **easily version control my AI prompts and rules** using Git so that I can track changes, collaborate with others, and revert to previous versions of my “knowledge base”.