# Prompt B — Expand selected ideas into full weekend-sprint plans

> **Usage:** paste the prompt below into an LLM and set the `SELECTED` parameter to a comma-separated list of idea numbers or titles from Prompt A (e.g., `SELECTED=1,3,6`). The model must **only** elaborate the selected ideas in the exact structure below.  
> **Output requirement:** For each selected idea produce the structured block exactly as specified — no extra sections or commentary.

---

## Q&A context (same facts — use as facts)
- Primary user: experienced iOS/Swift developer; comfortable with other languages, Docker, backend/web work.  
- Time budget per weekend sprint: **6–10 hours**. Multi-week projects allowed, **max 3 weekends** per project; each weekend must produce a tangible stage.  
- Domains: **creative writing**, **developer tools**, **productivity**.  
- AI must be **core/essential**. Text primary.  
- Preferred AI features: **prompt engineering**, **RAG**, **agents/multi-step planning**, **few-shot / fine-tuning**, **embeddings & semantic search**, **evaluation / adversarial testing**.  
- Audience: **self**. User dislikes trivial RAGs / simple prompt toys.

---

## Parameters (fill before running)
- `SELECTED` — comma-separated list of idea indices or exact titles from Prompt A. (Required.)  
- `MAX_WEEKENDS` — integer 1..3 (default 3).  
- `PLATFORM_PREFERENCE` — “Swift/iOS preferred” or “no preference” (default: no preference).  
- `MODEL_USAGE` — “paid-APIs ok” / “local models preferred” / “no preference” (affects infra hints).

---

## Output format (for each selected idea — strict block)
Produce one block per selected idea with the following exact headings and short content. Keep each bullet concise.

**Name (title exactly as in Prompt A)**  
**One-sentence description:** *<single sentence restating the problem and solution>*  
**Why prompting alone is insufficient:** *<single concise sentence naming the external capabilities required>*  
**Core AI techniques:** *<up to 3 items, comma-separated>*  
**Weekend-sprint plan (1–3 sprints):**  
- **Sprint 1 (6–10h):** *<timeboxed checklist of concrete tasks to deliver a runnable core/MVP — aim for ~4–7 checklist items>*  
- **[Optional] Sprint 2 (6–10h):** *<small extension to add measurable value — checklist>*  
- **[Optional] Sprint 3 (6–10h):** *<stretch / robustness / scaling tasks — checklist>*  
**Minimal infra / tooling required:** *<short list — e.g., Docker, local runner, LLM API, Git provider, test framework>*  
**Estimated effort:** *<number of weekends (1–3)>*

---

## Rules & constraints (strict)
- Each sprint must be realistically finishable in **6–10 hours**.  
- Do **not** propose tasks that are merely “run this prompt”; each sprint must include programmatic, verifiable steps (execution, tests, instrumentation, sandboxing, dataset creation, CI hook, transaction-safe operations, etc.).  
- If `PLATFORM_PREFERENCE=Swift/iOS preferred`, include a minimal Swift-based client or UI option in Sprint 1.  
- Keep each field succinct; total expanded block per idea should fit on ~1/2–1 page of plain text.

---

**Now:** elaborate the ideas listed in `SELECTED` following the exact block structure above.