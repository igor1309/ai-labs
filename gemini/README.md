# Gemini CLI: Power User Best Practices

This document summarizes key workflows for using the Gemini CLI effectively. It focuses on treating the CLI not just as a tool, but as a programmable and reusable component of a modern development environment.

## Table of Contents
1.  [Providing Context with the `@` Syntax](#1-providing-context-with-the—syntax)
2.  [Reusing Instructions from Any Folder](#2-reusing-instructions-from-any-folder)
3.  [Enriching Long-Term Memory with Files](#3-enriching-long-term-memory-with-files)
4.  [Core Concept: Prompts as a Reusable Library](#4-core-concept-prompts-as-a-reusable-library)
5.  [Workflow: “Prompts-as-Code” in Practice](#5-workflow-prompts-as-code-in-practice)

—

### 1. Providing Context with the `@` Syntax

The `@` syntax is the recommended way to provide files, directories, or even images as context for your prompt. It’s more powerful and explicit than piping text via standard input.

**Syntax:**
```bash
gemini “Your prompt about the file(s)” @/path/to/file1.txt @/path/to/another/file.log
```

**Key Examples:**

*   **Ask about a single file:**
    ```bash
    gemini “What is the purpose of the ‘User’ class in this file?” @./models/user.java
    ```

*   **Combine multiple files for cross-referencing:**
    ```bash
    gemini “Based on the html and the css, why isn’t the main header blue?” @index.html @styles/main.css
    ```

*   **Mix text and files:**
    ```bash
    gemini “My error is ‘Connection Refused’. Review my docker-compose and nginx config to find the cause.” @docker-compose.yml @nginx.conf
    ```

### 2. Reusing Instructions from Any Folder

To maintain a clean and scalable library of prompts, you can store them in any folder and call them using the `-p` or `—prompt` flag. This avoids cluttering the default `~/.gemini/prompts` directory.

**Scenario:**
Imagine you have a project with its own set of prompts.
```
~/my-project/
├── src/
│   └── app.js
└── prompts/
    └── code-reviewer.txt```

**Usage:**
You can use the `code-reviewer.txt` prompt from anywhere by providing its path.

```bash
# While inside the ~/my-project/ directory
gemini -p prompts/code-reviewer.txt @src/app.js

# Or, from any other directory on your system
gemini —prompt ~/my-project/prompts/code-reviewer.txt @/path/to/some/other/code.py```

For convenience, create a shell alias in your `.bashrc` or `.zshrc`:
```bash
alias review=“gemini -p ~/my-project/prompts/code-reviewer.txt”

# Now you can just run:
review @src/app.js
```

### 3. Enriching Long-Term Memory with Files

For information that should be available across multiple conversations (like team coding standards or API documentation), use the `gemini cache`. This creates a persistent, searchable memory.

**Step 1: Add Files to the Cache**
Use the `gemini cache add` command. The files can be located anywhere on your system.

```bash
# Add your team’s coding standards document
gemini cache add ~/Documents/company-docs/python-style-guide.md

# Add API documentation from a project folder
gemini cache add ~/dev/my-api/docs/api-v2-endpoints.json
```

**Step 2: Query Using `@cached`**
Use the special `@cached` keyword in your prompt. This tells Gemini to perform a semantic search over your cached documents and inject the most relevant information as context.

```bash
# Ask a question referencing the cached style guide
gemini “Does this function follow our company’s docstring format? @cached” @my_function.py

# Ask about the API documentation you added
gemini “How do I authenticate to get a user token, according to the docs? @cached”
```

### 4. Core Concept: Prompts as a Reusable Library

The most effective way to use the Gemini CLI is to treat your prompts as a version-controlled, reusable library (“Prompts-as-Code”). Instead of creating one-off commands, you build a collection of plain-text instruction files.

**Advantages:**
*   **Maintainability:** Improve a prompt in one file, and every script or alias that uses it is instantly updated.
*   **Version Control:** Store your prompts in a Git repository to track changes, collaborate with your team, and revert to previous versions.
*   **Shareability:** Your prompt library is portable. It can be used across different projects and even by different AI agents (e.g., in a Python script that calls the Gemini API).
*   **Clarity:** A command like `gemini -p ~/prompts/git-commit.txt` is more self-explanatory than a custom, opaque command.

### 5. Workflow: “Prompts-as-Code” in Practice

This workflow ties all the above concepts together into a professional, scalable system.

**1. Create a Central Git Repo for Prompts:**
Your team creates a repository (`company-prompts`) to store and version-control all shared prompts.
```
company-prompts/
├── database/
│   ├── schema-reviewer.txt
│   └── query-optimizer.txt
└── git/
    └── commit-message-generator.txt
```

**2. Clone and Set Up Environment:**
Each developer clones this repo. For ease of use, they set an environment variable in their `.bashrc` or `.zshrc`.
```bash
# Add to ~/.zshrc
export PROMPTS_DIR=“~/dev/company-prompts”
```

**3. Create Personal Aliases:**
Developers create short, memorable aliases that reference the prompt library.
```bash
# Add to ~/.zshrc

# Alias for reviewing database schemas
alias review_db=“gemini -p $PROMPTS_DIR/database/schema-reviewer.txt”

# Alias for generating a git commit message from staged changes
alias gmc=“git diff —staged | gemini -p $PROMPTS_DIR/git/commit-message-generator.txt”
```

**4. Seamless Daily Use:**
This setup makes complex operations simple and consistent.

*   **Review a new database migration file:**
    ```bash
    review_db @migrations/V3__add_user_profiles.sql
    ```

*   **Generate a conventional commit message:**
    ```bash
    git add .
    gmc
    ```