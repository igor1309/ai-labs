<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# summarise [https://youtu.be/68BS5GCRcBo?si=3kYqFvli9sdt_Jil](https://youtu.be/68BS5GCRcBo?si=3kYqFvli9sdt_Jil)

Peter Steinberger’s “You Can Just Do Things” talk is a fast-paced, highly practical live demo showing how AI agents can dramatically accelerate software development, especially when using workflows like Codex and Claude Code.[^1][^2][^3]

### Key Themes and Workflow Insights

- Steinberger demonstrates his personal agentic coding workflow, including running multiple agents simultaneously (“you never have enough agents running side by side”), building features directly on the main branch, and leveraging voice-first and freestyle prompting in his day-to-day development.[^4][^1]
- Codex is favored over Claude for its deeper codebase integration and more generous context limits, meaning GPT models are more eager to read code and follow prompts without requiring meticulous planning or steering.[^1]
- Agents automate context gathering (via CLI tools), logging, test generation, and documentation, freeing the developer to experiment rapidly and cheaply.[^5][^6][^1]
- Steinberger's approach to context management and planning—writing plans for large features and letting the model handle smaller ones in the same session—allows for fast iteration and minimal branching, embracing “code is cheap” and frequent refactoring.[^7][^6][^1]


### Feature Building and Test Strategy

- The session features live development of an “arena” feature: an agent analyzes and compares the compatibility of up to four Twitter users, fetching up to 1,000 tweets total, caching results, and scoring team compatibility numerically.[^1]
- Instead of strict TDD, tests are often added after features are built, placing trust in the model’s ability to identify issues and generate tests within a preserved context.[^6][^1]
- Steinberger emphasizes keeping the code comments and CLI documentation concise and up-to-date, often asking the agents themselves to update working memory, purge outdated info, and add style guides dynamically.[^1]


### Philosophical Takeaways

- The message is that with modern AI workflows, experimentation is fast and low-cost—developers can “just do things” with much less overhead, eschewing traditional branching and specification-heavy processes unless absolutely required.[^7][^4][^1]
- Steinberger warns against overengineering with excessive tooling, advocating for pragmatic, minimalistic setups, and only structuring workflows as needed for current problems.[^1]


### Tooling and Infrastructure Highlights

- Favorite tools include Ghostty (terminal), Vistaflow (test orchestration), custom CLI wrappers for API calls and logging, and manual context priming with minimal external API dependency.[^6][^1]
- The workflow demonstrates creating and wiring up backend features (e.g., new database tables) in real-time, handling context compacting and errors dynamically, and iterating interactively with agents.[^1]


### Practical Inspiration

- The talk closes by reinforcing the freedom and adaptability granted by AI-driven coding—“you can just do things”—and suggesting that developers can ship, refactor, and iterate with minimal friction, leveraging agents to do most of the heavy lifting in coding, testing, and documentation.[^2][^5][^6][^1]
<span style="display:none">[^10][^11][^12][^13][^14][^15][^16][^17][^18][^19][^20][^8][^9]</span>

<div style="text-align: center">⁂</div>

[^1]: https://www.youtube.com/watch?v=68BS5GCRcBo

[^2]: https://open.substack.com/pub/eliteaiassistedcoding/p/you-can-just-do-things-steipete

[^3]: https://elite-ai-assisted-coding.dev/p/you-can-just-do-things-steipete

[^4]: https://x.com/steipete/status/1965806643691622878

[^5]: https://steipete.me/posts/2025/the-future-of-vibe-coding

[^6]: https://steipete.me/posts/2025/optimal-ai-development-workflow

[^7]: https://newsletter.pragmaticengineer.com/p/software-engineering-with-llms-in-2025

[^8]: https://github.com/steipete/speaking

[^9]: https://www.youtube.com/watch?v=fu7th5HiADo

[^10]: https://x.com/steipete/status/1944873113218367579

[^11]: https://gist.github.com/tkersey/e4d9923922d80c065f9d

[^12]: https://steipete.me/posts

[^13]: https://maven.com/p/210ed5

[^14]: https://www.reddit.com/r/Anthropic/comments/1lptuj5/he_built_a_ssh_tool_that_can_control_all_your_cli/

[^15]: https://elite-ai-assisted-coding.dev

[^16]: https://steipete.me

[^17]: https://mastodon.social/@steipete/114678167494622424

[^18]: https://www.linkedin.com/posts/waghnakh_ai-agenticcoding-claude-activity-7346135771092787200-Y_Al

[^19]: https://github.com/steipete

[^20]: https://cup.columbia.edu/author-interviews/steinberger-problem-god/

