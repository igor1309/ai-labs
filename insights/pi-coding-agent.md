---
date: 2026-01-18
---

# Pi Coding Agent by Mario Zechner 

## Insights
- Build CLI tools with README files instead of MCP (now use Skills). If must - look into Peter Steinberger's [mcporter](https://github.com/steipete/mcporter) tool that wraps MCP servers as CLI tools.
- People use sub-agents mid-session to save context, but that’s the wrong model. Context gathering should happen first, in a separate session, producing a reusable artifact. That artifact gives a fresh agent full context without polluting its window and provides better observability and control.
- I’m not against sub-agents; they have valid uses. I mainly use them for code review, spawning pi with a review prompt and collecting the output.
- Despite popular belief, models are still bad at finding all the context needed for a feature or bug fix. They tend to read fragments instead of full files, which makes them miss critical details and leads to incomplete solutions.
- Name top level repo `{name}-mono`.
- Kitty keyboard protocol.
- No plan mode. Gather context in one session, write plans to file, start fresh for implementation.
- Claude Code only looks one level deep for SKILL.md files, so each skill folder must be directly under the skills directory. Clone the repo somewhere, then [symlink individual skills](https://github.com/badlogic/pi-skills#claude-code).
- While some harnesses like opencode support self-hosted models, it usually doesn't work well. Mostly because they rely on libraries like the [Vercel AI SDK](https://ai-sdk.dev/), which doesn't play nice with self-hosted models for some reason, specifically when it comes to tool calling.
- [Models.dev — An open-source database of AI models](https://models.dev/)

## POI
[blog post discussion](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/):
- Restrictions and architecture of the agent
- Just 4 APIs that need support to talk most LLM providers
- LLM API Wild West
- Structured split tool results: portion handed to the LLM and a portion for UI display
- Context handoff between providers was a feature pi-ai was designed for from the start.
- Writing a terminal user interface is not rocket science per se.
- GUI: retained mode vs immediate mode.
- Minimal system prompt.
- Minimal toolset.
- No MCP support. The alternative is simple: build CLI tools with README files.
- No background bash.
- No sub-agents. People use sub-agents within a session thinking they're saving context space, which is true. But that's the wrong way to think about sub-agents. Using a sub-agent mid-session for context gathering is a sign you didn't plan ahead. If you need to gather context, do that first in its own session. Create an artifact that you can later use in a fresh session to give your agent all the context it needs without polluting its context window with tool outputs. That artifact can be useful for the next feature too, and you get full observability and steerability, which is important during context gathering.
- I’m not dismissing sub-agents entirely—there are valid uses. I most often use them for code review, spawning pi with a review prompt via a custom slash command and collecting the output.
- I welcome contributions. But as with all my open source projects, I tend to be dictatorial. A lesson I've learned the hard way over the years with my bigger projects.
- Blog page footer: This page respects your privacy by not using cookies or similar technologies and by not collecting any personally identifiable information.

## Kitty keyboard protocol
- [Comprehensive keyboard handling in terminals - kitty](https://sw.kovidgoyal.net/kitty/keyboard-protocol/)
- [Terminal Setup]](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent#terminal-setup)

**Ghostty**: Add to your Ghostty config (~/.config/ghostty/config - or use `CMD+,`):

```
keybind = alt+backspace=text:\x1b\x7f
keybind = shift+enter=text:\n
```

## Skills
- [Skills README](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/skills.md)
- [Skills for pi coding agent (compatible with Claude Code and Codex CLI)](https://github.com/badlogic/pi-skills)

## References
- Original source: [The Signature Flicker | Peter Steinberger](https://steipete.me/posts/2025/signature-flicker)
- [buildwithpi.ai](https://shittycodingagent.ai/)
- [What I learned building an opinionated and minimal coding agent](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/)
- [GitHub - badlogic/pi-mono: AI agent toolkit: coding agent CLI, unified LLM API, TUI & web UI libraries, Slack bot, vLLM pods](https://github.com/badlogic/pi-mono/tree/main)
- [pi-mono/packages/coding-agent at main · badlogic/pi-mono · GitHub](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent)
- [Models.dev — An open-source database of AI models](https://models.dev/)
- Linked in blog post [Agent Design Is Still Hard | Armin Ronacher's Thoughts and Writings](https://lucumr.pocoo.org/2025/11/21/agents-are-hard/)
- [GitHub - steipete/mcporter: Call MCPs via TypeScript, masquerading as simple TypeScript API. Or package them as cli.](https://github.com/steipete/mcporter)

---
Annotations: 0,5110 SHA-256 93c4ccdf984ebdd854c4  
&Writing Tools:   
@: 571,3 718,3 2978,3 3167,3 3336,21  
...
