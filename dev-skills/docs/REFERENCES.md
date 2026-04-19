# REFERENCES

[Skills for Claude!](https://blog.fsck.com/2025/10/16/skills-for-claude/) by Jesse Vincent, auther of [Superpowers](https://github.com/obra/superpowers)
- TDD skill creation methodology
- [`using-superpowers/SKILL.md`](https://github.com/obra/superpowers/blob/main/skills/using-superpowers/SKILL.md) should work with gemini-cli and codex

[Amplifier: Supercharged AI Development Environment](https://github.com/microsoft/amplifier/) by Microsoft
- [agents](https://github.com/microsoft/amplifier/tree/main/agents)

[Jason Gorman (Codemanship)](https://codemanship.wordpress.com)
- **TDD Under The Microscope**  
  - [#1 - Usage-Driven Design](https://codemanship.wordpress.com/2025/09/24/tdd-under-the-microscope-1-usage-driven-design/) - formalize TDD workflow declaratively
  - [#2 - Assert First](https://codemanship.wordpress.com/2025/09/30/tdd-under-the-microscope-2-assert-first/) - write assertion first, work backwards to setup
- **The AI-Ready Software Developer**  
  - [#1 – Separation of Concerns](https://codemanship.wordpress.com/2025/10/17/the-ai-ready-software-developer-1-separation-of-concerns/)
    > LLM coding assistants struggle with code that lacks separation of concerns due to limited effective context size, despite large advertised capacities. Modular code with clear dependencies reduces cognitive load and improves model accuracy, minimizing errors and hallucinations. Continuous refactoring is recommended to maintain modular design and prevent generated code from hindering model performance.
  - [#2 – Clarifying With Examples](https://codemanship.wordpress.com/2025/10/18/the-ai-ready-software-developer-2-clarifying-with-examples/)
    > Reflecting back information with examples is a powerful way to clarify software requirements and catch discrepancies before coding. This technique, which helps establish a shared vocabulary, is also effective when working with Large Language Models (LLMs) to generate code, as it reduces semantic ambiguity and improves the accuracy of the model’s predictions.
  - [#3 – One Problem At A Time](https://codemanship.Wordpress.com/2025/10/19/the-ai-ready-software-developer-3-one-problem-at-a-time/)
    > While additional context can help reduce misinterpretations by LLMs, their effective maximum context sizes are much smaller than advertised. Larger contexts can degrade model accuracy and lead to low-confidence predictions, especially when they fall outside the model’s training data distribution. To mitigate these issues, it is recommended to keep inputs specific and small, ideally solving one problem per prompt, similar to the benefits of micro-iterative practices like TDD and refactoring.
  - [#4 – Continuous Testing](https://codemanship.wordpress.com/2025/10/20/the-ai-ready-software-developer-4-continuous-testing/)
    > Working in small steps with an LLM, keeping contexts small and specific, and cleanly separating concerns in architecture allows for more frequent testing. Automated tests, especially unit tests against decoupled modules, enable comprehensive retesting after each small change, ensuring the LLM hasn’t broken anything. This approach is beneficial regardless of whether AI is used.

## Repos

- [Superpowers](https://github.com/obra/superpowers)
- [Superpowers Skills](https://github.com/obra/superpowers-skills)
