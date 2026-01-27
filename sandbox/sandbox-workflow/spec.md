---
date: 2026-01-27
model: gpt-5.2
---

# Sandbox & TODO Issue Auto-Creation Workflow  
**Specification**

## 1. Purpose

This workflow automatically converts newly introduced draft or planning artifacts into GitHub Issues, ensuring early visibility and traceability of work-in-progress items.

Specifically, on pushes to the `trunk` branch, it detects:
- newly added **top-level entries** under `sandbox/`, and
- newly added **`TODO.md` files** anywhere in the repository,

and creates one GitHub Issue per detected item.

---

## 2. Trigger

- **Event:** `push`
- **Branch:** `trunk` only

The workflow runs on every push to `trunk` and internally determines whether any relevant changes are present.

---

## 3. Diff Scope

- The workflow inspects the diff between:
  - `github.event.before` and
  - `github.sha`

This represents the full set of changes introduced by the push, including multi-commit pushes.

Only items that **exist in the final tree at `github.sha`** are eligible.

---

## 4. Detected Items

### 4.1 Sandbox Top-Level Entries

An item qualifies if all of the following are true:

- The path matches:  
  `sandbox/<name>`
- `<name>` is a **direct child** of `sandbox/`
- The entry is **newly added** in the diff
- The entry exists at `github.sha`
- The entry may be either a file or a directory
- Renames are treated as new additions

Only the top-level entry is considered; deeper files under an existing entry do not trigger issues.

---

### 4.2 `TODO.md` Files

An item qualifies if all of the following are true:

- The file name is exactly `TODO.md`
- The file is **newly added** in the diff at any repository path
- The file exists at `github.sha`
- Renames are treated as new additions

There are no ignore paths.

---

## 5. Issue Creation Rules

### 5.1 One Issue per Item

- Exactly **one GitHub Issue** is created per detected item.
- Sandbox entries and `TODO.md` files are handled independently.

---

### 5.2 Idempotency

Before creating an issue, the workflow must check **open issues only**.

An issue is considered to already exist if there is an open issue whose **title exactly matches** the deterministic title defined below.

If such an issue exists, **no new issue is created** for that item.

Closed issues do **not** prevent new issue creation.

---

## 6. Issue Formats

### 6.1 Sandbox Entry Issues

- **Title**  
  ```
  [sandbox] <name>
  ```
  where `<name>` is the direct child name under `sandbox/`.

- **Labels**
  - `sandbox`

- **Body**
  - Includes a link to the repository path:
    ```
    sandbox/<name>
    ```

---

### 6.2 `TODO.md` Issues

- **Title**  
  ```
  [todo] <full-repo-relative-path>
  ```
  Example:
  ```
  [todo] docs/guides/TODO.md
  ```

- **Labels**
  - `todo`

- **Body**
  - Includes a link to the full repository-relative path of the `TODO.md` file.

---

## 7. Ordering

- There is **no required ordering** when processing or creating multiple issues within a single run.

---

## 8. Non-Normative Implementation Notes

- Diff detection may rely on `git diff --name-status` or equivalent.
- Detection should treat added (`A`) and renamed (`R`) paths as eligible.
- When `github.event.before` is missing or invalid (e.g., initial push), the implementation may diff against the empty tree.
- Authentication, permissions, and token selection are **implementation details** and intentionally out of scope for this specification.

---