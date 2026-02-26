---
date: 2026-02-26
model: gpt-5.2
source: https://chatgpt.com/share/69a04dee-78a4-8003-8d39-553a25372c4f
---

# Project Nomos
## AI Sovereignty Kernel (Phase 0–2)

---

## 1. Purpose

Nomos is a minimal AI sovereignty layer that centralizes:

- Model vendor control
- Cost governance
- Unified API surface
- Basic prompt injection safeguards

It exists to prevent direct coupling between projects and LLM providers.

---

## 2. Initial Scope (Phase 1)

Nomos v0 focuses on five capabilities:

### 1. Vendor Abstraction
- Unified API over multiple LLM providers
- Simple routing rules
- Manual fallback configuration
- No auto-magic

### 2. Cost Control
- Token usage logging
- Per-project budget limits
- Hard stop when exceeded
- Simple usage reports

### 3. Unified API
- OpenAI-compatible proxy surface
- Governance (auth, budget, logging, routing) wraps the compatible API
- Versioned contract
- JSON over HTTP + SSE streaming

### 4. Best-Effort Prompt Safeguards
- Input sanitization
- Basic injection pattern detection
- Optional system prompt reinforcement
- Logging of suspicious payloads

No illusion of perfect safety.

### 5. VPS Deployment
- Single service
- Stateless where possible
- SQLite or lightweight store
- Docker-compatible
- No cloud vendor lock-in

---

## 3. Non-Goals (For Now)

- Advanced agent orchestration
- Complex workflow engines
- Enterprise RBAC
- Auto-scaling infra
- Full compliance frameworks
- Real-time anomaly detection

Those are future concerns.

---

## 4. Origin

Nomos extracts and generalizes the provider layer from Oracle.
Oracle is the first consumer.

---

## 5. Operating Model

- Solo-maintained
- Incremental release train
- Explicit versioning
- Add features only when reused by at least two projects
- Prefer simplicity over completeness

---

## 6. Strategic Intent

Nomos ensures:

- No project talks directly to LLM vendors
- Cost is measurable and enforceable
- Provider switching remains possible
- AI access remains under structured control

Nomos defines the rules under which your AI systems operate.
