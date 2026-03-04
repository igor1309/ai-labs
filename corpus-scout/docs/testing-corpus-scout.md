---
date: 2026-03-04
model: gpt-5.2
---

# Testing Corpus Scout

Yes. That separation is correct.

1️⃣ Unit tests (fast, deterministic, no MCP)

Test the core retrieval engine directly:
	•	input → search function
	•	assert:
	•	exact file
	•	exact heading
	•	no extra files
	•	must_contain tokens
	•	measure:
	•	latency (wall clock)
	•	memory if relevant

These run:
	•	inside normal test framework
	•	no Docker
	•	no MCP
	•	no Langfuse

Purpose: verify deterministic logic.

⸻

2️⃣ Integration tests (via MCP)

Test the exposed scout service:
	•	call through MCP boundary
	•	assert:
	•	same structured output contract
	•	no serialization drift
	•	no schema mutation
	•	optionally log to Langfuse:
	•	scout_version
	•	test_case_id
	•	scores

Purpose: verify transport + contract + infra.

⸻

3️⃣ Role of Langfuse here

Not for correctness.
Correctness belongs to unit tests.

Langfuse adds value for:
	•	comparing versions visually
	•	storing historical outputs
	•	spotting latency regressions across builds
	•	inspecting edge-case failures interactively

If you don’t need that visibility, you can skip it.

⸻

So architecture becomes:

core retrieval → unit tests (authoritative)
MCP wrapper → integration tests
Langfuse → observability + version comparison (optional)

That is clean, minimal, and aligned with “deterministic primitive”.