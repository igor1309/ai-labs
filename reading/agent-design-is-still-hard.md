---
date: 2026-01-18
source: "[Agent Design Is Still Hard | Armin Ronacher's Thoughts and Writings](https://lucumr.pocoo.org/2025/11/21/agents-are-hard/)"
---

## Insights
- The significant differences between models necessitate building your own agent abstraction.
- Working with the Vercel SDK is incredibly challenging when dealing with provider-side tools.
- The different platforms have very different approaches to caching.
- Reinforcement in the agent loop feeds tool outputs back into the system to restate goals, track progress, add hints, and reflect state changes—especially in parallel flows. Sometimes simple self-reinforcement is enough (e.g., echoing a task list). It’s also useful for flagging broken state and prompting the agent to backtrack and retry earlier steps.
- Isolate failures. If execution is prone to failure, keep failed attempts out of the main context. One approach is to run iterative work in a sub-agent and report only success and a brief summary of failures. Another is context editing, selectively removing unhelpful failure output while preserving useful signals. The trade-off: context editing invalidates caches, so its cost must outweigh the benefit.
- Sub-agents / sub-inference. Agents that generate and execute code require shared state. Use a common virtual file system for tools and sub-agents to read and write artifacts. Ensure outputs aren’t trapped in a single tool; every tool should accept and produce file paths for other tools, enabling smooth handoffs between inference and execution.
- Using an output tool. Our agent communicates via an explicit output tool (e.g., email) triggered by prompt instructions, making tone and wording harder to control than direct text output. Using a secondary LLM to adjust tone increased latency and reduced quality, often leaking unwanted context. We handle missed tool calls by detecting them and reinforcing the agent to invoke the output tool before finishing.
- Model choice. Our top tool callers remain Haiku and Sonnet for the main loop, with Gemini as a strong alternative. GPT models have limited success there. For sub-tools like summarization, PDFs, and images, we use Gemini 2.5 to avoid Sonnet safety issues. Token price alone is misleading; better tool callers often cost less overall. Little has changed recently.
- Testing and evals. Agentic systems make external evaluations impractical, so testing relies on observability and instrumented runs. None of the approaches we’ve tried feel right, making it a frustrating open problem.

### Caching
The caching mechanism in the Anthropic agent is simple. One cache point follows the system prompt, and two at the conversation’s start, with the last moving up as the conversation progresses. Optimization options are available.

---
Annotations: 0,2778 SHA-256 081ad30539cd0f25e3af  
&Writing Tools: 174 178,12 217,11 234,3 268,58 359 821,9 962,3 985,8 1260,7 1315,3 1340,2 1369,4 1387,3 1465,3 1661 1666,3 1838,27 1974,40 2032,6 2046 2071,10 2084,2 2124,5 2149,4 2179,9 2242,2 2289 2373,6 2405,6 2452 2499,9 2589,8 2622,7 2647,12 2676,8 2742 2763,4  
@: 360,3 429,3 784,3 804 1191,3 1221 1539,3 1563 1953,3 1969 2317,3 2338 2536,14 2777  
...
