# AI Coder

A central library of reusable prompts and guides for AI-assisted software development.

This repository contains a curated collection of instructions designed to be portable and effective across various AI coding agents, including (but not limited to) `Gemini CLI` and `Claude Code`.

## Core Philosophy: Agent-Agnostic Instructions

AI tools and their interfaces evolve rapidly. This library is built on the principle that the quality of your instructions—the prompts and contextual guides—should be a durable, version-controlled asset, independent of any single tool.

By separating the "what to do" (the prompts) from the "how to do it" (the specific CLI command), we create a powerful, reusable toolkit that remains valuable even as the underlying AI agents change.

## Repository Structure

The library is organized into two main categories:

*   `/guides`: Contains foundational knowledge, methodologies, or style guides. These are extended context documents that set the stage for the AI, teaching it *how* to think about a task.
    *   *Example*: `tdd.md`, `api-design-principles.md`, `python-styleguide.md`

*   `/prompts`: Contains focused, concrete instructions for a specific task. These are the direct commands you give the AI.
    *   *Example*: `code-reviewer.md`, `generate-unit-tests.md`, `refactor-to-async.md`

## How to Use This Library

The general pattern for using these assets is to combine them when interacting with your chosen AI agent. You provide a **guide** as the foundational context and a **prompt** as the specific command.

Think of it like this:

> **[A Guide]** teaches the AI the necessary principles.
>
> **[A Prompt]** tells the AI what to do with those principles.

**Conceptual Workflow:**

To have an AI review a piece of code according to your team's style guide, you would provide the agent with:

1.  **The Foundational Context:** The content of `guides/python-styleguide.md`.
2.  **The Specific Task:** The content of `prompts/code-reviewer.md`.
3.  **Your Target Code:** The content of your `my_file.py`.

This modular approach allows you to mix and match guides and prompts to create highly specific and effective instructions for any development task.