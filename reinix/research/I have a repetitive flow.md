I have a repetitive flow
- Task preparation - often interactive non-linear process
- Give a task to ai agent with mid-level LLM (say Sonnet)
- agent works, completes the task (failure, incl network loss - just stop, no retry, no anything )
- I ask best model (gpt-5.4-thinking) to review task results (adversarial review)
- If pass - stop (completed)
- If fail - task, implementation and review are handed to fixer - top model like opus - that creates fix plan
- Then it handed off to sonnet
- Repeat until done

This is a basic sketch, I intentionally omit details like token budget, turn counts to focus on essential to not be buried on multiple details.

Right now, these orchestration is done by me. I find it taxing, repetitive. Very often plan, result, and review our files, artifact saved to disk, file system available for all agents, under control, so each step is committed, verifiable, restorable, revertable.

For agents, I use Claude Code CLI and Codex CLI, running in the same worktree.

I want you to run deep research on this topic to find solutions implementing this type of orchestration. For example, is it possible to have OpenCode is orchestrated delegating the tasks that I have described to Claude Code CLI and Codex CLI? What are other solutions?

Do not pretend to know unknown, clarify by asking me questions. Ask one question of the time, providing options in the mirror with letters for my quick answer each option you provide should have some color from you, for example, quick, simple, complex, industry, standard, best practices, etc.