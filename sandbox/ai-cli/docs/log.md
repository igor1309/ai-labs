# Log

## 2025-08-31
Add docs User Stories and Spec developed with NotebookLM

## 2025-08-30
Initial Research and Concept Development

*   **Concept:** A domain-agnostic CLI wrapper for LLMs to abstract raw API usage.
*   **Configuration:** Hierarchical (Git-like) system for project-specific and global settings.
*   **Architecture:** Three-layered separation of concerns:
    *   **Tool Layer:** Stable API interaction.
    *   **Knowledge Layer:** Curated, domain-specific prompts and rules.
    *   **Assembly Layer:** Intelligently combines tools and knowledge.
*   **Goal:** A reproducible, transparent, and portable framework for interacting with LLMs across various tasks.

Inspired by [Stuck in the Chatbox? Here’s When You Actually Need the API](https://youtu.be/dOfiBS_SE3E?si=i-0yDysitZ1drd3Q)