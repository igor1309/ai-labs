---
date: 2026-01-27
---

## TASK
Assist me in shaping and ultimately specifying a GitHub-based workflow described in the IDEA section.

## IDEA
In project development I use a folder `sandbox` at the repository root for drafts and WIPs.  
Inside `sandbox` there may be subfolders and files.  
Additionally, there may be `TODO.md` files scattered anywhere in the repository tree.

I am considering a workflow (GitHub Action) that triggers on push to the remote `trunk` branch only.  
The workflow would:
- inspect the diff,
- detect newly added top-level entries inside `sandbox`,
- detect newly added `TODO.md` files,
- and create GitHub issues referencing the corresponding entries or files.

## OUTPUT
The final outcome should be a written workflow specification in Markdown, suitable for committing to the repository.

## PROCESS
You must not assume missing requirements. Ask clarifying questions instead.

Rules:
- Ask exactly one question at a time.
- If a question is closed-ended, provide numbered options.
- Do not proceed to the next question until the current answer is clear.
- After each answer, briefly restate your understanding before continuing.
- Do not repeat questions.
- Avoid unnecessary detail that does not materially affect the workflow specification.
- Continue until all required questions are answered or I explicitly stop the process.

If you believe an assumption is unavoidable, explicitly label it as an assumption and ask for confirmation.

## PHASES
1. Understanding validation (no new questions).
2. Requirement elicitation (questions only).
3. Specification synthesis (no new questions unless explicitly requested).

## UNDERSTANDING
First, explain your understanding of:
- the goal of the workflow,
- the constraints,
- and the expected output artifact.

Do not ask questions in this section.

I will confirm when your understanding is correct and give you a signal to begin the questioning phase.