---
date: 2026-01-18
source: "[Agent Design Is Still Hard | Armin Ronacher's Thoughts and Writings](https://lucumr.pocoo.org/2025/11/21/agents-are-hard/)"
---

## Isolate failures

## Idea
Run tests in sub-agent. Sub-agent is not allowed to make code changes at all. Its task is to perform tests, extract result (meaningful extraction/structured output happens only in case of failures, for success just return “success”).

https://chatgpt.com/share/696cc45e-4740-8003-83bd-7af552cba3ea

SEE RESEARCH IN PERPLEXITY https://www.perplexity.ai/search/find-claude-code-sub-agent-and-.XPMUByiSUCJs0z_Hl6BWQ#0

## Summary
Isolate failures. If execution is prone to failure, keep failed attempts out of the main context. One approach is to run iterative work in a sub-agent and report only success and a brief summary of failures.

## Source (edited)
If you expect a lot of failures during code execution, there is an opportunity to hide those failures from the context. ... run tasks that might require iteration individually. You would run them in a subagent until they succeed and only report back the success, plus maybe a brief summary of approaches that did not work. It is helpful for an agent to learn about what did not work in a subtask because it can then feed that information into the next task to hopefully steer away from those failures.

