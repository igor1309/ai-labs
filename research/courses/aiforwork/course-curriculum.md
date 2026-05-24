---
date: 2026-05-12
model: claude-opus-4-7
description: "Derived curriculum for the AI For Work course based on the public landing page — non-developer audience"
source_url: "https://aiforwork.courses/"
---

# AI For Work Course Curriculum

## Curriculum Goal

Turn information workers without programming background into people who can delegate routine information work to AI agents reliably: define the task, supply the right inputs, run the agent, and verify the result — across data processing, research, and browser automation, against the participant's own real work data.

## Target Student

The curriculum is designed for non-developers whose work is information-heavy:

- Primary: marketing, research, content, sales, operations, HR, analytics, project management, leadership.
- Secondary: founders and domain experts who want to ship internal automations without hiring engineering.
- Not suitable: developers looking to build applications, or buyers expecting plug-and-play templates.

## Learning Outcomes

By the end of the course, students should be able to:

- Set up an agent environment from scratch (subscriptions, installation, first run).
- Frame an agent task using a universal structure: task → input data → result → verification.
- Convert unstructured raw data (tables, transcripts, page dumps) into a clean clickable report.
- Run open-source research against public sources (job boards, market data) and produce structured output.
- Run closed-source research against Telegram channels, chats, and discussions for monitoring and summarization.
- Use browser automation safely against forms, LinkedIn, dashboards, and web cabinets.
- Detect agent errors and verify sources before trusting agent output.
- Deploy at least one end-to-end automation against their own real work routine.

## Practical Spine

Students work against their own real work data throughout the course. The instructional examples in each module (multi-source tables, job boards, Telegram channels, web cabinets) act as scaffolds, but the final project is each participant's own routine, presented at the end.

The participant's own work — not a shared toy project — is the practical spine. This is a deliberate contrast with developer-focused courses that anchor on a single demo application.

## Weekly Curriculum

### Onboarding Week: Setup From Scratch

Purpose:

- Bring participants who have never used AI agents from zero to a first working run.

Topics:

- Choosing and setting up subscriptions.
- Installing required tools.
- Payment setup, including for participants with restricted card access.
- First agent execution against a simple input.

Practice:

- Confirm local agent access.
- Run a small first interaction end-to-end.

Deliverable:

- A working agent environment ready for the modules.

### Module 1: Data Processing — From Messy Table to Presentation

Purpose:

- Establish the universal task structure on a familiar surface: structuring raw inputs into a deliverable.

Topics:

- Defining the task in plain language.
- Supplying multi-source inputs (multiple tables, call transcripts, website content).
- Producing a clean, clickable report with consistent visuals.
- Verifying the output against the original sources.

Practice:

- Take a real messy multi-source dataset.
- Frame the task, supply inputs, run the agent, and verify the report.

Deliverable:

- A repeatable pipeline that turns unstructured input into a presentable report.

### Module 2: Open-Source Research

Purpose:

- Use agents to collect and structure data from public sources for hiring, sales, or market analysis.

Topics:

- Identifying suitable public sources.
- Designing the agent task for structured collection.
- Output schemas (tables, sheets, summaries).
- Quality checks and verification against source pages.

Practice:

- Run an open-source research task (example: job board) on a question the participant actually has.

Deliverable:

- A reusable open-source research routine with verification steps.

### Module 3: Closed-Source Research

Purpose:

- Use agents to process conversational and channel data (Telegram channels, chats, discussions) for monitoring and insight.

Topics:

- Ingesting closed-source content safely.
- Designing the agent task for monitoring vs summarization vs insight extraction.
- Handling volume and recency constraints.
- Verifying conclusions against the underlying messages.

Practice:

- Run a closed-source research task against a channel or chat the participant actually follows.

Deliverable:

- A repeatable monitoring or summarization workflow for a high-volume conversational source.

### Module 4: Browser Automation

Purpose:

- Delegate routine browser interaction to agents without losing control or breaching platform constraints.

Topics:

- Safe agent access to forms, LinkedIn, analytics dashboards, web cabinets.
- Boundaries: when to let the agent click and when to gate it.
- Verifying results before acting on them.
- Recovering from agent confusion or platform changes.

Practice:

- Automate one routine browser interaction the participant performs regularly.

Deliverable:

- A safely scoped browser-automation routine against a real work surface.

### Final Project: Automate Your Own Routine

Purpose:

- Apply the universal structure to a real, participant-chosen work routine and present it.

Topics:

- Choosing a routine worth automating.
- Combining data processing, research, and browser automation as needed.
- Verification design for the routine.
- Presenting the automation to peers.

Practice:

- Build, test, and demonstrate one end-to-end automation against personal work data.

Deliverable:

- A demonstrated, deployed automation and a final presentation.

## Capstone

The final capstone is one fully working automation against the participant's own work data, presented to the cohort:

1. Choose a real recurring work routine.
2. Decompose it into the universal structure (task → input → result → verification).
3. Combine techniques from the four modules as needed.
4. Build and run the automation against real inputs.
5. Verify outputs and harden the verification step.
6. Present to the cohort.

## Suggested Assessment Criteria

Students can be evaluated against practical artifacts:

- Clarity of task definition in plain language.
- Quality of input preparation (files, tables, folders, links).
- Completeness of the verification step.
- Robustness of the automation against varied real inputs.
- Quality of the final presentation against a real work routine.

## Recommended Student Artifacts

- Agent environment setup checklist.
- Universal task-structure template (task → input → result → verification).
- Data-processing pipeline (messy input → clickable report).
- Open-source research routine.
- Closed-source research routine.
- Browser-automation routine.
- Final personal-routine automation and presentation slides.
