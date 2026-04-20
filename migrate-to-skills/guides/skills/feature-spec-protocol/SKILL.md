---
name: feature-spec-protocol
version: "1.0.0"
author: Igor Malyarov
description: Use when creating a feature specification through an ordered clarification protocol that asks one question at a time, avoids hidden assumptions, and fills the spec incrementally.
---

# Feature Specification Protocol

Create feature specifications through a structured Q&A protocol: do not assume, ask one question at a time, and fill the spec incrementally.

---

## 1. Principles
- **Ask, don’t assume:** Each section is populated only after explicit clarification.
- **Clarity over verbosity:** Concise but not superficial — specs must be complete enough to implement and test.
- **Structure:** Every spec follows the same top-level outline.
- **Determinism:** No hidden defaults. Optionality only if explicitly confirmed.
- **Final Artifact:** Delivered as a Markdown document.

---

## 2. Protocol Steps

### Step 1 — Scope
Questions to ask:
- What is the **platform/environment** (iOS, web, backend, general)?
- What is the **minimum supported version/requirement** (OS, language, runtime)?
- Is the feature **general-purpose** or **domain-specific**?
- Does the feature need to support **multiple contexts** (e.g. phone/tablet, dev/prod)?

**Spec Section → “Scope”**

---

### Step 2 — Public API
Questions to ask:
- What is the **entry point** (view, function, endpoint, workflow)?
- What is the **expected signature** (parameters, generics, return types)?
- Is the **data model** static or dynamic?
- How should **external state** be bound or injected?

**Spec Section → “Public API”**

---

### Step 3 — Data & State
Questions to ask:
- What are the **data inputs** (types, constraints)?
- What is the **primary state binding** (if any)?
- How is **initial state** determined?
- How should invalid or missing state be handled (fallback, no-op, error)?

**Spec Section → “Data & State Rules”**

---

### Step 4 — Configuration
Questions to ask:
- What parameters should be **configurable**?
- Should config be a **structured object** with nested groups, or **flat parameters**?
- Which parameters are **mandatory** and which are **optional**?
- What are the **default values**?

**Spec Section → “Config”**

---

### Step 5 — Behavior & Interaction
Questions to ask:
- What are the **core behaviors**? (e.g. snapping, transitions, retries)
- How does **user interaction** work? (tap, drag, click, API call)
- Should programmatic state changes be **animated**, **instant**, or **ignored** if invalid?
- Are there **edge limits** (finite/infinite, bounds, constraints)?

**Spec Section → “Behavior & Interaction”**

---

### Step 6 — Layout & Visual Rules
Questions to ask (if visual/UI):
- What is the **sizing model** (fixed, relative, aspect ratio)?
- How is **spacing** defined (absolute, relative)?
- What **visual effects** apply (scale, opacity, colors, transitions)?
- Should effects be **continuous (interpolated)** or **discrete (stepped)**?

**Spec Section → “Layout & Visual Rules”**

---

### Step 7 — Edge Cases
Questions to ask:
- What happens with **empty input**?
- What happens if **external state doesn’t match items**?
- What happens during **rotation, resize, redeploy**?
- Should invalid input trigger **fallback, no-op, or error**?

**Spec Section → “Edge Cases & Guarantees”**

---

### Step 8 — Validation
Questions to ask:
- What are the **valid ranges** for config values?
- Should invalid values be **asserted in debug**, **clamped in release**, or both?

**Spec Section → “Validation”**

---

### Step 9 — Deliverables
Questions to ask:
- What concrete **artifacts** should be delivered? (SwiftUI view, API endpoint, config struct, README)
- Should a **sample usage** be included?
- Should docs/examples use **realistic values** or **abstract placeholders**?

**Spec Section → “Deliverables”**

---

## 3. Output Template (Markdown)

Each spec should follow this skeleton:

```markdown
# <FeatureName> Specification

## 1) Scope
...

## 2) Public API
...

## 3) Data & State Rules
...

## 4) Config
...

## 5) Behavior & Interaction
...

## 6) Layout & Visual Rules
...

## 7) Edge Cases & Guarantees
...

## 8) Validation
...

## 9) Deliverables
...
```

---

## 4. Usage
1. Start with **Step 1 (Scope)**.  
2. Ask questions sequentially.  
3. Fill each section only after answers are confirmed.  
4. Deliver final document in Markdown.  
5. Keep consistent structure across all specs.

---

## 5. Example (Seed Spec)

Below is a minimal example spec created using this protocol.  
It demonstrates structure and level of detail.

```markdown
# Toast Notification Specification

## 1) Scope
- **Platform:** iOS 15+
- **Purpose:** Temporary on-screen notification (non-blocking)
- **Context:** General-purpose, reusable

## 2) Public API
```swift
ToastView(message: String, config: ToastConfig)
```
- Renders a transient message overlay.

## 3) Data & State Rules
- **Input:** `message` must be non-empty `String`.
- **State:** Stateless; each call produces an independent toast.

## 4) Config
```swift
struct ToastConfig {
    var duration: TimeInterval        // default 2.0s
    var position: Position            // .top or .bottom (default .bottom)
    var style: Style                  // colors, corner radius
}
```
- Defaults provided; override as needed.

## 5) Behavior & Interaction
- Toast fades in, remains visible for `duration`, fades out automatically.
- Dismisses on user tap before `duration`.

## 6) Layout & Visual Rules
- Width: 80% of container width
- Max height: 2 lines of text
- Rounded corners (default 8pt)
- Shadow opacity 0.2

## 7) Edge Cases & Guarantees
- Empty message → no toast (no-op).
- Multiple toasts → queued; shown sequentially.

## 8) Validation
- Assert `duration > 0`
- Clamp excessively long text to 2 lines with ellipsis

## 9) Deliverables
- `ToastView` SwiftUI component
- `ToastConfig` struct
- Example usage snippet in README
```
