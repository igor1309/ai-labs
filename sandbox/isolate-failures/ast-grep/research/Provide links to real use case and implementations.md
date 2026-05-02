<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# Provide links to real use case and implementations, remove all your own code suggestions

Here are concrete links to **real** ast-grep + agent usage and implementations, with brief notes on each.

## Official ast-grep + AI / Skill Integrations

- **ast-grep Claude Skill (official repo)** – Claude Code skill that teaches Claude to write and use ast-grep rules for advanced code search and refactoring.[^1]
https://github.com/ast-grep/claude-skill
- **Using ast-grep with AI Tools / Claude Code Skill (ast-grep docs)** – Official guide section on Claude skill usage, rule development process, and MCP usage for AST dumps and rule testing.[^2]
https://ast-grep.github.io/advanced/prompting.html
- **ast-grep MCP Server (official repo)** – MCP server that exposes ast-grep search / rule APIs to agents (Claude Desktop, Cursor, etc.), including examples of “find console.log”, “async with await” rules, and custom config.[^3]
https://github.com/ast-grep/ast-grep-mcp
- **ast-grep MCP Server listing (PulseMCP)** – Standardized MCP server descriptor file with install/config/usage instructions, directly used by MCP-compatible clients.[^4]
https://www.pulsemcp.com/servers/ast-grep
- **In‑Depth Analysis of the ast-grep MCP Server – Practical Guide for AI Engineers** – Long-form article with concrete workflows: AI-powered audits like “find all direct process.env access”, setup steps with uv, and Claude Desktop example config.[^5]
https://skywork.ai/skypage/en/In-Depth-Analysis-of-the-ast-grep-MCP-Server:-A-Practical-Guide-for-AI-Engineers/19725449836192686
- **Unlock Code‑Aware AI: Deep Dive into the ast-grep MCP Server** – Focuses on real prompts such as “scan for direct fetch calls not going through apiClient”, lint-like conventions checks, and security hygiene patterns.[^6]
https://skywork.ai/skypage/en/unlock-code-aware-ai-deep-dive/1979007761129971712


## Claude Code Skills / Agent Skills Using ast-grep

- **Official ast-grep Claude Skill listing** – Marketplace-style skill entry with “When to use ast-grep vs text tools” and guidance for structural refactors, formatting-independent matching, and “old_string not unique” problems.[^7]
https://claude-plugins.dev/skills/@xdg/xdg-claude/ast-grep
- **Agent Skill by ast-grep (SkillsMP)** – Agent Skills–standard definition for ast-grep, including when to trigger it and how Claude Code / Codex agents should use it for structural code search.[^8]
https://skillsmp.com/skills/ast-grep-claude-skill-ast-grep-skills-ast-grep-skill-md
- **ast-grep Skill by settlemint (SkillsMP)** – Real skill definition showing how a multi-agent “crew” uses ast-grep for codebase-wide analysis and refactoring.[^9]
https://skillsmp.com/skills/settlemint-agent-marketplace-crew-skills-ast-grep-skill-md
- **ast-grep-code-search Skill by biwsantang (SkillsMP)** – Concrete skill packaging ast-grep as a structural search tool for Claude Code.[^10]
https://skillsmp.com/ko/skills/biwsantang-dotfiles-claude-claude-skills-ast-grep-skill-md
- **First‑run with agent skills (macwright.com)** – Blog where the author asks Claude to create an ast-grep skill for finding function calls; describes what worked and what failed in real usage.[^11]
https://macwright.com/2025/10/20/agent-skills
- **How to Create Claude Code Skills (WebsearchAPI blog)** – Not ast-grep specific, but includes examples of wrapping CLI tools like ast-grep into Claude Code skills under the Agent Skills standard.[^12]
https://websearchapi.ai/blog/how-to-create-claude-code-skills


## Real-World Usage / Field Reports

- **Reddit: “CaludeCode can use ast-grep to improve search efficiency and accuracy”** – Discussion with concrete advice on prioritizing ast-grep over rg/grep for structural queries, and user reports that Claude sometimes struggles to use it well.[^13]
https://www.reddit.com/r/ClaudeAI/comments/1lefmff/caludecode_can_use_astgrep_to_improve_search/
- **“Ast-grep in Action” – Gerry’s Blog (2025‑07)** – Real-world patterns for using ast-grep in large TypeScript/JS codebases, including refactors and performance notes.[^14]
http://blog.gerryyang.com/tools/2025/07/24/ast-grep-in-action.html
- **Biome’s GritQL Plugin vs ast-grep (Dev.to, 2025‑06)** – Comparative article with concrete examples of structural transformations in TS/JS using ast-grep, and where it is preferred over text tools.[^15]
https://dev.to/herrington_darkholme/biomes-gritql-plugin-vs-ast-grep-your-guide-to-ast-based-code-transformation-for-jsts-devs-2
- **Introducing ast-grep (Dev.to)** – Earlier but still relevant examples of refactoring and structural search that later agent workflows build on.[^16]
https://dev.to/herrington_darkholme/introducing-ast-grep-a-tool-for-structural-searching-and-transforming-code-391c
- **AI-Native Universal Linter (coderabbit.ai)** – Describes using ast-grep with LLMs as a universal linter / rule engine, including JSON-mode integration for structured analysis.[^17]
https://www.coderabbit.ai/blog/ai-native-universal-linter-ast-grep-llm
- **AST-Grep MCP Server: Phase 2 Performance Enhancements** – Detailed report on streaming, large-file handling, and reliability considerations in real MCP deployments.[^18]
https://www.aledlie.com/reports/2025-11-16-ast-grep-mcp-phase2-streaming-and-large-files/


## Codex / Agent Skills Context

- **OpenAI Codex Agent Skills docs** – Specifies the open Agent Skills standard used by Codex CLI, which these ast-grep skills target.[^19]
https://developers.openai.com/codex/skills/
- **Agent Skills – Claude Code Docs** – Anthropic’s official description of Agent Skills, how skills like ast-grep are discovered and activated inside Claude Code (updated 2026‑01).[^20]
https://code.claude.com/docs/en/skills
- **What Are Agent Skills? (ExplainThis)** – Overview of the Agent Skills standard, including discussion of code tools like ast-grep in multi-agent stacks.[^21]
https://www.explainthis.io/en/ai/agent-skills
- **ITPro: “OpenAI’s ‘Skills in Codex’ service…”** – Describes how Codex uses skills (including code tools) to improve agent efficiency.[^22]
https://www.itpro.com/software/development/openais-skills-in-codex-service-aims-to-supercharge-agent-efficiency-for-developers


## Where ast-grep is Recommended vs rg/grep (Real Guidance)

- **ast-grep Claude Skill guidance: When to use ast-grep vs text tools** – Explicit criteria (structural changes, formatting independence, pattern variation, “old_string not unique”)[^7]
https://claude-plugins.dev/skills/@xdg/xdg-claude/ast-grep
- **Using ast-grep with Claude Code Skill (ast-grep docs)** – Concrete examples of structural queries agents should send to ast-grep (“async functions without error handling”, “components using a hook”, etc.).[^2]
https://ast-grep.github.io/advanced/prompting.html
- **Reddit thread on grep, find, ast-grep** – Real user comparing when to use sg vs rg/grep in Claude Code contexts.[^23]
https://www.reddit.com/r/ClaudeAI/comments/1lw6zix/grep_find_astgrep/

If you want, the next step can be to extract from these links only the **Swift / TS / Python**-relevant examples and cross-reference how they’re packaged in Claude Code / Codex skills.
<span style="display:none">[^24][^25][^26][^27][^28]</span>

<div align="center">⁂</div>

[^1]: https://github.com/ast-grep/claude-skill

[^2]: https://ast-grep.github.io/advanced/prompting.html

[^3]: https://github.com/ast-grep/ast-grep-mcp

[^4]: https://www.pulsemcp.com/servers/ast-grep

[^5]: https://skywork.ai/skypage/en/In-Depth-Analysis-of-the-ast-grep-MCP-Server:-A-Practical-Guide-for-AI-Engineers/1972544983619268608

[^6]: https://skywork.ai/skypage/en/unlock-code-aware-ai-deep-dive/1979007761129971712

[^7]: https://claude-plugins.dev/skills/@xdg/xdg-claude/ast-grep

[^8]: https://skillsmp.com/skills/ast-grep-claude-skill-ast-grep-skills-ast-grep-skill-md

[^9]: https://skillsmp.com/skills/settlemint-agent-marketplace-crew-skills-ast-grep-skill-md

[^10]: https://skillsmp.com/ko/skills/biwsantang-dotfiles-claude-claude-skills-ast-grep-skill-md

[^11]: https://macwright.com/2025/10/20/agent-skills

[^12]: https://websearchapi.ai/blog/how-to-create-claude-code-skills

[^13]: https://www.reddit.com/r/ClaudeAI/comments/1lefmff/caludecode_can_use_astgrep_to_improve_search/

[^14]: http://blog.gerryyang.com/tools/2025/07/24/ast-grep-in-action.html

[^15]: https://dev.to/herrington_darkholme/biomes-gritql-plugin-vs-ast-grep-your-guide-to-ast-based-code-transformation-for-jsts-devs-29j2

[^16]: https://dev.to/herrington_darkholme/introducing-ast-grep-a-tool-for-structural-searching-and-transforming-code-391c

[^17]: https://www.coderabbit.ai/blog/ai-native-universal-linter-ast-grep-llm

[^18]: https://www.aledlie.com/reports/2025-11-16-ast-grep-mcp-phase2-streaming-and-large-files/

[^19]: https://developers.openai.com/codex/skills/

[^20]: https://code.claude.com/docs/en/skills

[^21]: https://www.explainthis.io/en/ai/agent-skills

[^22]: https://www.itpro.com/software/development/openais-skills-in-codex-service-aims-to-supercharge-agent-efficiency-for-developers

[^23]: https://www.reddit.com/r/ClaudeAI/comments/1lw6zix/grep_find_astgrep/

[^24]: https://milvus.io/blog/why-im-against-claude-codes-grep-only-retrieval-it-just-burns-too-many-tokens.md

[^25]: https://habr.com/ru/articles/983214/

[^26]: https://github.com/alfredolopez80/multi-agent-ralph-loop

[^27]: https://dev.to/zloeber/ai-lessons-learned-3k6c

[^28]: https://github.com/parcadei/Continuous-Claude-v2

