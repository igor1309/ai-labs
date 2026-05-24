# Prompt Grden App – Specifications & User Stories

## 1 · MVP Functional Specification (v 1.0)

### 1.1 Prompt Model
- **Title** — text  
- **Content** — Markdown (main prompt body)  
- **Tags** — flat list, multiple values per prompt  
- **Optional Note** — Markdown (rationale, links, references)

### 1.2 Prompt Creation & Editing
- Users can **create** and **edit** prompts.  
- While editing, the app displays a **diff** between *current edit* and *stored version* **for the prompt content only** (title, tags and note are excluded).  
- Only the latest version is saved (no history).

### 1.3 Search & Filter
- Users can **search** by **title**, **content** or **tags**.  
- Simple keyword matching (no ranking/fuzzy logic).  
- Users can **filter** prompts by one or more tags.

### 1.4 Favorites
- Users can **mark** prompts as *favorite*.  
- Users can **filter** the list to show *only favorites*.

### 1.5 Sorting
- Sort options:  
  1. **Last modified**  
  2. **Alphabetical** (A-Z, Z-A)

### 1.6 Copy to Clipboard
- One-tap / one-click action copies the **entire prompt content** to the clipboard.

---

## 2 · Optional Additions – MVP v2 (Not in MVP Scope)

### 2.1 Last Used Tracking (Opt-In)
- Each prompt records **last used date** (*use* = copy or view; exact rule is configurable).  
- Tracking is **disabled by default**.  
- When enabled:  
  - Prompts can be **sorted by “last used”**.  
  - Basic statistics (e.g., most-used prompts) become possible.

---

## 3 · User Stories

### 3.1 Core MVP

| ID | User Story |
|----|------------|
| US-01 | *As a user, I want to create a new prompt with title, markdown content and tags so that I can reuse it later.* |
| US-02 | *As a user, I want to optionally add a markdown note to a prompt so that I can explain its purpose or add links.* |
| US-03 | *As a user, I want to edit the prompt content and see the differences compared with the saved version so that I don’t lose track of changes.* |
| US-04 | *As a user, I want to search prompts by title, content or tags so that I can quickly find what I need.* |
| US-05 | *As a user, I want to filter prompts by tag to narrow down my view.* |
| US-06 | *As a user, I want to mark prompts as favorites so that I can access my go-to prompts faster.* |
| US-07 | *As a user, I want to filter the list to show only favorites.* |
| US-08 | *As a user, I want to sort prompts by title or by last modified so that I can browse in a way that fits my workflow.* |
| US-09 | *As a user, I want to quickly copy a prompt’s content to the clipboard so I can use it in another app.* |

### 3.2 Optional MVP v2

| ID | User Story |
|----|------------|
| US-10 | *As a user, I want to track when I last used a prompt so I can sort by recency and understand which prompts I use most.* |
| US-11 | *As a user, I want to disable usage tracking to keep the app minimal or preserve my privacy.* |