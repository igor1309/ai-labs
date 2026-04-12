---
date: 2026-04-12
model: perplexity
source: https://claude.com/blog/the-advisor-strategy
version: 0.0.1
---

**1. Overview**  
The blog post from April 9, 2026, introduces the **advisor strategy** on the **Claude Platform**, a technique to boost AI agent intelligence cost-effectively by pairing a powerful **Opus** model as an advisor with cheaper **Sonnet** or **Haiku** models as executors.[1]

**2. How It Works**  
The **executor** (Sonnet/Haiku) handles tasks, tools, and iterations, consulting **Opus** only for tough decisions via the new **advisor tool** (**advisor_20260301**). **Opus** provides plans or corrections using shared context, without tools or final output, all in one API call.

**3. Benefits and Performance**  
Evaluations show **Sonnet + Opus advisor** improves **SWE-bench Multilingual** by 2.7 points, costs 11.9% less per task than Sonnet alone; **Haiku + advisor** doubles scores on **BrowseComp** at lower cost. Features **max_uses** limits, separate token billing, and compatibility with other tools.

**4. Implementation**  
Add the advisor tool to **Messages API** with beta header **anthropic-beta: advisor-tool-2026-03-01**; executor decides invocations automatically.

## Key Takeaways  
- **Advisor strategy** delivers near-**Opus** smarts at **Sonnet**-level costs via on-demand consultation.  
- Now in beta; test on your workloads for optimal executor/advisor pairing.  
Hope this helps! Let me know if you have any other questions!

Sources
[1] The advisor strategy: Give agents an intelligence boost - Claude https://claude.com/blog/the-advisor-strategy
[2] Blog | Claude https://claude.com/blog
[3] We're bringing the advisor strategy to the Claude Platform. - Reddit https://www.reddit.com/r/ClaudeAI/comments/1sgy11x/were_bringing_the_advisor_strategy_to_the_claude/
[4] Advisor tool - Claude API Docs https://platform.claude.com/docs/en/agents-and-tools/tool-use/advisor-tool
[5] Claude's Post - LinkedIn https://www.linkedin.com/posts/claude_were-bringing-the-advisor-strategy-to-the-activity-7448074270909464576-JBHo
[6] Anthropic Advisor Strategy: Smarter AI Agents (2026) https://www.buildfastwithai.com/blogs/anthropic-advisor-strategy-claude-api
[7] Skill authoring best practices - Claude API Docs https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
[8] Claude Advisor Strategy Gives AI Teams A Smarter Way To ... https://goldie.agency/claude-advisor-strategy/
[9] What Is the Anthropic Advisor Strategy? How to Cut AI Agent Costs ... https://www.mindstudio.ai/blog/anthropic-advisor-strategy-cut-ai-agent-costs/
[10] Define tools - Claude API Docs https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools
[11] Blog | Claude https://claude.com/blog?d7430fcd_page=8
[12] Legal summarization - Claude API Docs https://platform.claude.com/docs/en/about-claude/use-case-guides/legal-summarization
[13] claude advisor strategy chase ai tutorial - Marketing Agent Blog https://marketingagent.blog/tag/claude-advisor-strategy-chase-ai-tutorial/
[14] Getting Started with Claude Code: A Researcher's Setup Guide https://paulgp.substack.com/p/getting-started-with-claude-code
[15] The advisor strategy: Give Sonnet an intelligence boost with Opus https://app.daily.dev/posts/the-advisor-strategy-give-sonnet-an-intelligence-boost-with-opus-sz81cxm85
