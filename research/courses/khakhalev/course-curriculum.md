---
date: 2026-04-30
model: gpt-5
description: "Derived curriculum for Khakhalev's AI Coding course based on the public landing page"
source_url: "https://ai.khakhalev.com/course/"
---

# Khakhalev AI Coding Course Curriculum

## Curriculum Goal

Turn experienced developers from ad hoc AI tool users into engineers who can run a controlled AI Coding workflow: clarify ideas, prepare context, plan implementation, delegate work to agents, verify output, maintain repository quality, and reuse workflows through skills and agent infrastructure.

## Target Student

The curriculum is designed for developers with enough engineering experience to supervise AI output:

- Primary: middle and senior developers.
- Secondary: strong juniors who already understand system design and can validate implementation quality.
- Not suitable: people without programming experience.

## Learning Outcomes

By the end of the course, students should be able to:

- Use AI agents without losing control of design and quality.
- Prepare project context so agents understand existing behavior.
- Write task prompts that separate research, coding, and verification.
- Use feedback loops to reduce hallucinations and recover from errors.
- Find, fix, and verify bugs with AI assistance.
- Convert an existing repository into an AI-native repository.
- Create reusable Plan & Act workflows with skills, agents, and external context.
- Review and maintain AI-generated changes through code review, security review, and refactoring.

## Practical Spine

Students work on a Task Tracker project for the full 7 weeks. The project starts as a simple application, then accumulates features and technical debt. The course uses it to demonstrate realistic work in a mature codebase:

- Project discovery.
- Feature delivery.
- Bug discovery and repair.
- Documentation and instruction design for agents.
- Autonomous implementation planning.
- Repeatable workflow creation.
- Refactoring and long-term maintenance.

## Weekly Curriculum

### Week 0: Tool Setup and Baseline

Purpose:

- Prepare students who have not yet used Codex or Claude Code actively.

Topics:

- Installing and configuring Codex.
- Installing and configuring Claude Code.
- Subscription and payment setup.
- Course platform, Telegram chat, Zoom calls, and GitHub practice access.

Practice:

- Confirm local tool access.
- Run a small agent interaction against the practice project.

Deliverable:

- A working development environment with Codex and Claude Code available.

### Week 1: First Feature With an AI Agent

Purpose:

- Learn how to start working with an existing project through an agent.

Topics:

- Project research with AI.
- Task framing.
- Prompting for research, implementation, and verification.
- First feature delivery.

Practice:

- Ask the agent to map the Task Tracker project.
- Define one small feature.
- Split the request into research, coding, and verification prompts.
- Implement the feature with agent assistance.

Deliverable:

- A first AI-assisted feature with documented prompts and verification notes.

### Week 2: Context and Feedback Loops

Purpose:

- Make agents more reliable by managing context and using corrective loops.

Topics:

- What context means for an AI agent.
- How context is lost, overloaded, or misinterpreted.
- Feedback-loop design.
- Hallucination prevention.
- Agent self-correction.

Practice:

- Give the agent insufficient context and observe failure modes.
- Improve context through files, summaries, and focused prompts.
- Force the agent to inspect errors and correct its own implementation.

Deliverable:

- A repeatable context checklist and a feedback-loop prompt pattern.

### Week 3: Debugging, Bug Fixes, and Safety

Purpose:

- Use AI Coding for bug discovery and repair without increasing production risk.

Topics:

- Debugging with an AI agent.
- Reproducing bugs.
- Fixing bugs safely.
- Safety boundaries for AI Coding.
- Verification before trusting agent output.

Practice:

- Seed or identify bugs in the Task Tracker.
- Ask the agent to reproduce and isolate the issue.
- Implement a minimal fix.
- Verify the fix and check for regressions.

Deliverable:

- A bug-fix workflow that includes reproduction, root-cause evidence, fix, and verification.

### Week 4: Making the Repository AI-Native

Purpose:

- Prepare an existing repository so agents can follow project rules and preserve behavior.

Topics:

- Repository preparation for AI Coding.
- Instruction files for agents.
- Documentation structure for agent context.
- Keeping agents aligned with existing features.
- Improving maintainability of generated code.

Practice:

- Audit the Task Tracker repository for missing instructions and context gaps.
- Add or refine agent-facing docs.
- Create rules for coding style, testing, review, and verification.
- Re-run an implementation task to compare output quality before and after repository preparation.

Deliverable:

- An AI-native repository baseline with agent instructions and documentation patterns.

### Week 5: Plan & Act for Autonomous Coding

Purpose:

- Learn the course author's Plan & Act approach for delegating implementation to agents from a strong specification.

Topics:

- Planning before implementation.
- Research phase design.
- Prototyping.
- Decomposition.
- Turning task descriptions into executable plans.
- Controlling autonomous implementation.

Practice:

- Take a larger Task Tracker feature idea.
- Brainstorm the idea with the agent.
- Produce an implementation plan.
- Break the plan into independently verifiable steps.
- Hand the plan to the agent for execution.

Deliverable:

- A Plan & Act implementation plan and an agent-executed feature branch.

### Week 6: Skills, Agents, MCPs, and Repeatable Workflows

Purpose:

- Turn one-off prompts into reusable agent workflows.

Topics:

- External context.
- Skills.
- MCPs.
- Subagents or specialized agents.
- Repeatable workflow design.
- Plan & Act as an operational workflow.

Practice:

- Extract the best prompts and process rules from previous weeks.
- Package them into reusable skills or workflow instructions.
- Connect external context where useful.
- Run a repeatable workflow against a new Task Tracker task.

Deliverable:

- A small workflow toolkit for autonomous agent work, including skills/instructions and usage criteria.

### Week 7: Maintaining an AI-Native Repository

Purpose:

- Keep an AI-assisted codebase healthy after feature delivery accelerates.

Topics:

- Entropy management.
- Refactoring.
- Code review.
- Security review.
- Maintaining agent instructions over time.
- The shift in developer work as AI Coding becomes normal.

Practice:

- Review the Task Tracker after several AI-assisted changes.
- Identify technical debt introduced by speed.
- Run code review and security review workflows.
- Refactor one meaningful weak spot.
- Update agent instructions to prevent recurrence.

Deliverable:

- A maintenance report with review findings, refactoring, security notes, and updated AI-native repository rules.

## Capstone

The final capstone is a complete AI Coding workflow applied to the Task Tracker:

1. Brainstorm a feature with AI.
2. Explore edge cases and implementation risks.
3. Create a Plan & Act implementation plan.
4. Delegate implementation to an agent.
5. Review tests, code review output, and safety checks.
6. Demo the feature in the project.
7. Capture reusable workflow instructions for future tasks.

## Suggested Assessment Criteria

Students can be evaluated against practical artifacts:

- Quality of project research and context gathering.
- Clarity of task prompts and implementation plans.
- Evidence that bugs are reproduced before fixes.
- Verification quality before accepting agent output.
- Repository documentation quality for agent use.
- Ability to decompose large work into safe autonomous steps.
- Quality of reusable skills and workflows.
- Quality of maintenance, refactoring, and review practices.

## Recommended Student Artifacts

- Tool setup checklist.
- Project research notes.
- Prompt patterns for research, coding, and verification.
- Context checklist.
- Feedback-loop template.
- Bug-fix workflow.
- AI-native repository instructions.
- Plan & Act template.
- Reusable skills/workflow bundle.
- Code review and security review checklist.
- Final Task Tracker demo notes.
