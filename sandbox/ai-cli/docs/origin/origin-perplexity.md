---
date: 2025-08-30
description: "CLI LLM Script Architecture: A Developer Discussion"
---

<me>
It’s my understanding that LLM from Google/OpenAI/Antropic have APIs with a lots of features, but using them from terminal is far from comfortable. I guess a possible way could be to write a script that
- uses system prompt from particular place (similar to gitignore it could try local folder first with fallback to global)
- takes input as a user prompt
- scans particular folders for rules or protocols refining system prompt
- gets and uses API keys
- composes and makes API request
- presents output
Does this make sense? Do multiple products made by developers (from solo to companies) do something like this?
I want to just discuss this.
No code until I say so.

<ai>
# CLI LLM Script Architecture: A Developer Discussion

Your proposed script architecture makes complete sense and aligns perfectly with current best practices in the CLI tool ecosystem. Many developers and companies have indeed implemented similar solutions, recognizing the same pain points you've identified with raw API usage.

## The Architecture You're Describing

Your proposed system would essentially create a **context-aware, hierarchical configuration system** for LLM interactions, similar to how Git handles configuration. This approach addresses several real developer needs:

**System Prompt Management**: Using a gitignore-style hierarchy (local → global fallback) for system prompts is excellent design. This allows project-specific AI behavior while maintaining personal defaults.[1][2]

**Protocol/Rule Scanning**: Having folders with rules that refine system prompts creates a **composable prompt engineering system**. This is particularly valuable for teams or projects with specific AI interaction patterns.

**Unified API Management**: Abstracting away the differences between OpenAI, Anthropic, and Google APIs behind a single interface removes significant friction.

## Existing Tools Implementing Similar Patterns

Several prominent tools have implemented variations of your proposed architecture:

### Production Tools with Similar Approaches

**LLM by Simon Willison** is perhaps the closest to your vision. It features:[3][4]

- Hierarchical configuration management
- Template system for reusable prompts
- Plugin architecture for different providers
- Command-line friendly interface
- System prompt customization

**AIChat** implements many of your ideas:[5][6]

- Multi-provider support (20+ LLM providers)
- Configuration file management
- Shell assistant capabilities
- REPL mode with history and templates
- RAG integration for context-aware responses

**ShellGPT** offers:[7][8]

- Cross-platform shell integration
- Role-based system prompts
- Configuration files for persistent settings
- Custom prompt templates

### Enterprise and Professional Tools

**Terminal AI** demonstrates enterprise-grade implementation:[9]

- Multi-provider configuration management
- Interactive setup and validation
- File attachment and context management
- Clipboard integration

**Gemini CLI** shows Google's approach:[10]

- ReAct-style reasoning loops
- Built-in tool integration
- Large context windows for codebase analysis
- MCP (Model Context Protocol) support

## Why This Architecture Pattern Works

The architecture you're proposing has gained traction because it solves several critical problems:

**Context Preservation**: Unlike web interfaces, your system can maintain project-specific context and rules across sessions.

**Workflow Integration**: CLI tools integrate seamlessly into existing development workflows, automation scripts, and CI/CD pipelines.

**Configuration Management**: The hierarchical configuration approach (local → global) mirrors successful patterns from Git, allowing both personal and project-specific customization.[11][1]

**Composability**: By scanning folders for rules and protocols, you create a system where prompt engineering becomes modular and reusable.

## Advanced Implementation Patterns

Looking at the current ecosystem, successful tools often include:

**Template Systems**: Like LLM's template functionality, allowing reusable prompt patterns with variable substitution.[12]

**Tool Integration**: Many tools now support function calling and tool use, allowing LLMs to execute commands and access external resources.[13]

**Context Management**: Systems for handling file attachments, directory scanning, and maintaining conversation history.

**Provider Abstraction**: Unified interfaces that handle the differences between OpenAI's chat completions, Anthropic's messages API, and Google's generate content endpoints.

## Market Validation

The proliferation of tools in this space indicates strong developer demand. Terminal-based AI tools are seeing significant adoption because they:

- Maintain developer flow state (no context switching to browsers)
- Integrate with existing toolchains
- Provide scriptable, automatable interfaces
- Offer better privacy and control than web-based solutions

Your proposed architecture addresses real pain points and follows proven design patterns. The combination of hierarchical configuration, composable prompt engineering, and unified API management represents a mature approach to CLI LLM tooling that many developers would find valuable.

The fact that multiple successful tools have emerged with similar architectures validates your thinking about what developers actually need from command-line AI interfaces.

[1](https://www.bennadel.com/blog/4751-collocating-my-gitignore-configuration-files-with-the-omitted-files.htm)
[2](https://git-scm.com/docs/gitignore)
[3](https://simonwillison.net/2024/Jun/17/cli-language-models/)
[4](https://github.com/simonw/llm)
[5](https://github.com/sigoden/aichat)
[6](https://pro.tecmint.com/aichat-command-line-ai-tool-for-linux-users/)
[7](https://thebiglaskowski.com/posts/shellgpt-revolutionizing-cli-with-the-power-of-ai/)
[8](https://www.reddit.com/r/linux4noobs/comments/18rao15/shellgpt_chatgpt_for_the_shell_terminal/)
[9](https://github.com/dwmkerr/terminal-ai)
[10](https://www.qodo.ai/blog/best-ai-coding-assistant-tools/)
[11](https://www.bmc.com/blogs/gitignore/)
[12](https://llm.datasette.io/en/stable/templates.html)
[13](https://simonwillison.net/2025/May/27/llm-tools/)
[14](https://terminaltrove.com/categories/ai/)
[15](https://www.kevinleary.net/blog/using-official-openai-chatgpt-cli/)
[16](https://www.aiterm.net)
[17](https://www.reddit.com/r/Python/comments/123aiqk/introducing_gptty_v021_a_powerful_cli_wrapper_for/)
[18](https://github.com/boukeversteegh/ai-terminal-assistant)
[19](https://www.youtube.com/watch?v=PQEw7oEzO84)
[20](https://getstream.io/blog/best-local-llm-tools/)
[21](https://ekkinox.github.io/yai/)
[22](https://becomingahacker.org/using-the-aichat-cli-tool-3faf08da4a21)
[23](https://www.linuxuprising.com/2023/01/use-chatgpt-from-command-line-with-this.html)
[24](https://github.com/mattvr/ShellGPT)
[25](https://github.com/efJerryYang/chatgpt-cli)
[26](https://www.chuck-stack.org/ls/tool-aichat.html)
[27](https://www.reddit.com/r/86box/comments/1146z2e/loading_configuration_from_command_prompt/)
[28](https://www.cs.ucdavis.edu/~devanbu/files/cawom.pdf)
[29](https://www.youtube.com/watch?v=cHUFKcSzD7I)
[30](https://www.red-gate.com/simple-talk/development/dotnet-development/creating-ccli-wrapper/)
[31](https://learn.microsoft.com/en-us/windows-hardware/manufacture/desktop/windows-setup-command-line-options?view=windows-11)
[32](https://www.reddit.com/r/golang/comments/8d3qkr/go_cli_patterns/)
[33](https://docs.wiznet.io/Product/S2E-Module/WIZ750SR/CLI-Config-Tool-Tutorial/how-to-use-cli-config-tool)
[34](https://gist.github.com/maoxiaoke/cd960ac88e11b08cbb4fa697439ebc68)
[35](https://cloud.google.com/discover/what-is-prompt-engineering)
[36](https://www.reddit.com/r/ollama/comments/1c7tcuj/how_do_i_create_a_template_prompt_from_the/)
[37](https://www.youtube.com/watch?v=0OUODPRgPl8)
[38](https://www.prompthub.us/blog/prompt-patterns-what-they-are-and-16-you-should-know)
[39](https://python.langchain.com/docs/tutorials/llm_chain/)
[40](https://thedataexchange.media/warp-zach-lloyd/)
[41](https://console.groq.com/docs/prompting/patterns)
[42](https://llm.datasette.io/en/stable/help.html)
[43](https://www.prompt.security/blog/ai-coding-assistants-make-a-cli-comeback)
[44](https://help.openai.com/en/articles/6654000-best-practices-for-prompt-engineering-with-the-openai-api)

<me>
I’m thinking of kinda abstracted tool. Let me try to explain - this tool could be domain agnostic, kinda generic one, using domain knowledge from the context, kinda like this:

- say I’m developing a lore, or script
- in ‘.ai’ folder there could be system prompt with additional rules for scripting, character development, beet analysis, etc
  If I’m coding, I could use system prompt in ‘.ai’ folder as well as ‘.gemini’, ‘.claude’ rules.
  A system, a wrapper could use this to form system prompt and work with user input. The responsibility of this wrapper would be to compose API request.
  Just like git there could be a command that asks for a project domain (coding, scripting, etc) is and repopulate ‘.ai’ folder with relevant templates. Or that same wrapper been launched from folder that does not have ‘.ai’ could ask for domain and add it.

<ai>
This concept of a domain-agnostic, generic CLI AI tool with contextual awareness via structured folders like a “.ai” directory is very promising and aligns well with modern software design trends.

Such a wrapper that dynamically composes system prompts by aggregating rules/templates from multiple sources (e.g., '.ai' folder plus domain-specific subfolders like '.gemini' or '.claude') could flexibly adapt AI behavior to different contexts like storytelling, coding, or analysis.

The idea of a "project domain" command to scaffold or repopulate the local '.ai' folder with relevant prompt templates is elegant; it parallels how `git init` or `eslint --init` provide domain-specific starter configurations. This would enhance productivity by minimizing manual setup and ensuring contextual relevance in AI interactions.

Overall, this approach effectively provides a modular and composable prompt engineering system controlled by project context, which would be very useful for developers, writers, analysts, or any users engaging with AI across diverse domains. It creates a bridge between generalized LLM capabilities and domain-specific workflows in a maintainable and scalable way.

<me>
What I feel is important -  is a separation of tool and knowledge: looking for API keys, selecting model and setting its parameters, assembling and performing requests is more or less clear kinda boring developer work.
Curating own knowledge base is different - here is where unique experience and expertise comes. As with git there could be a simple template pack with guides for growing it 1 if I decide to open source it.
In between there is a connection how to create manageable rules for assembling system prompt.

<ai>
The distinction between **the tool** (handling API keys, model selection, request assembly) and **the knowledge base** (domain-specific expertise, curated rules, prompt templates) is indeed crucial and a smart approach.

### Separation Benefits

- **Tool as Infrastructure:** The core CLI wrapper becomes a stable, reusable infrastructure component focused on API interaction, configuration management, and prompt assembly logic. This is consistent developer-focused work that can be well standardized and documented.

- **Knowledge Base as Unique Asset:** Your curated rules, prompt patterns, domain-specific templates, and guidelines become the unique intellectual property. This is where creativity and domain expertise shine, offering differentiation and value beyond basic API usage.

- **Scalability and Community Growth:** Like gitignore or ESLint config packs, starting with simple template packs and incremental guides for expansion enables community contributions and customizations while maintaining a clear boundary between tooling and knowledge.

### On Rules for System Prompt Assembly

- Having **manageable, composable rules** for how templates and context fragments are combined into system prompts is key. This might involve layering:

  - Global defaults,
  - Project/domain-specific overrides,
  - User-level customizations,
  - Dynamic context insertion based on user input or files.

- Approaches like template inheritance, variable substitution, and modular prompt snippets can help maintain clarity and flexibility.

### Open Source Potential

- Providing a **starter template pack** with documentation on how to grow and customize the knowledge base will ease adoption and empower others to extend the system for their domains.

- This separation aligns with best practices in software ecosystems—core tooling remains lean and stable, while domain-specific knowledge lives in shareable packs that evolve independently.

In summary, this division creates a robust, maintainable framework that leverages your expertise effectively and invites collaborative growth while minimizing redundant tooling efforts.

<me>
how would you create a structured summary for this discussion?I'd like to have a comprehensive one, including the pain, the idea, sketch of core features, questions to consider

<ai>
Here is a comprehensive structured summary of the discussion:

---

# Structured Summary: CLI LLM Tool Discussion

## Pain Points Identified

- Using LLM APIs (OpenAI, Google, Anthropic) directly from the terminal is cumbersome and uncomfortable.
- Lack of flexible, configurable system prompt management in existing CLI tools.
- Difficulty in maintaining domain-specific knowledge bases and prompt engineering separately from tooling.
- Managing API keys, model selection, and assembling requests feels like repetitive developer overhead.
- No unified way to compose complex system prompts based on multi-layered domain/context rules.

## Core Idea Proposed

- Develop a **generic, domain-agnostic CLI wrapper tool** for LLM APIs that:
  - Uses a hierarchical configuration system for system prompts (local `.ai` folder with fallback to global).
  - Allows domain-specific subfolders (`.gemini`, `.claude`, etc.) to add specialized rules/templates.
  - Supports dynamic prompt composition by scanning these folders and assembling context-aware system prompts.
  - Separates **the tool’s responsibility** (API interaction, key management, request assembly) from **knowledge base management** (curating domain-specific rules, templates).

## Sketch of Core Features

- **Hierarchical Config Management**: Local per-project `.ai` folders with prompt templates and rules, with fallback to user/global configs.
- **Domain Command**: Command to initialize or re-populate `.ai` folder by asking user for project domain (e.g., scripting, coding, lore), seeding domain-specific prompt templates.
- **Composable Prompt Assembly**: Modular, layered prompt construction from global, domain, user, and dynamic context snippets.
- **Unified Provider Support**: Abstracts differences between OpenAI, Google, Anthropic APIs to interact via a consistent interface.
- **API Key and Model Management**: Transparently manages authentication and model parameters.
- **Minimal Core Tool, Rich Knowledge Packs**: Tool focuses on stable API calls and config loading; domain knowledge lives in shareable, extendable prompt packs.
- **Template Growth Guide**: Documentation and best practices on evolving and curating prompt templates as domain knowledge evolves.

## Questions to Consider

- How to best define a **template or rule format** for system prompts that balance flexibility with usability?
- How to handle **merging and conflict resolution** when multiple domain folders or user settings influence prompt construction?
- What **scalability strategies** could guide growth of knowledge packs without bloating the tool?
- What **user flows** should the domain-init command support for easiest onboarding?
- Should the tool support **interactive prompt debugging or previewing** to help users understand final system prompts before API calls?
- How to balance **generic tool design** with providing meaningful defaults or opinions to jumpstart domain pack creation?
- What are the important **security considerations** for API key management in a local CLI environment?
- Would support for **multiple models/providers in parallel** via a single prompt be valuable, and how to implement?

---

This summary encapsulates the major points, ideas, and open design considerations from the discussion. It can serve as a guide for outlining the project or communicating your vision clearly to collaborators or contributors.
