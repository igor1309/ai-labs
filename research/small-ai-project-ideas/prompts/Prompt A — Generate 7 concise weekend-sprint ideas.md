# Generate 7 concise weekend-sprint ideas

> **Instruction:** Produce **exactly 7** distinct weekend-sprint project ideas tailored to the supplied Q&A context (below).  
> **Output requirement:** numbered list 1..7; for each idea include **exactly two sentences**:  
> 1) **One-sentence title + one-line description** (title — colon — single sentence describing the project and the problem it solves).  
> 2) **One-sentence verification** that explicitly states **why the idea cannot be solved by a single sophisticated prompt** (name the concrete capability beyond prompting that is required).  
> Keep every sentence concise (≤ 30 words). Do **not** add extra commentary, examples, or fields.

---

## Q&A context (use as facts)
- Primary user: experienced iOS/Swift developer; comfortable with other languages, Docker, backend/web work.  
- Time budget per weekend sprint: **6–10 hours**. Multi-week projects allowed, **max 3 weekends** per project; each weekend must produce a tangible stage.  
- Domains of interest: **creative writing**, **developer tools**, **productivity** (do not restrict to one).  
- AI must be **core or essential** to the idea. Text is the primary data modality.  
- Preferred AI features: **prompt engineering**, **retrieval/RAG**, **agents/multi-step planning**, **few-shot / fine-tuning**, **embeddings & semantic search**, **evaluation / adversarial testing**.  
- Audience: **self** (practical usefulness weekly/occasionally).  
- User dislikes: trivial RAGs, primitive prompt-evals, single-turn writing toys, and ideas that are solvable by prompting alone.  
- Hard constraints: **none** (privacy, paid APIs, and infra choices are flexible).

---

## Additional rules (strict)
- Ideas must be **non-trivial, AI-centric problems** where prompting alone is insufficient.  
- The **verification sentence** must name the exact external capability required beyond prompting (e.g., executing builds/tests, sandboxed code execution, SMT solvers, transactional data transforms, adversarial search & statistical aggregation, telemetry-driven A/B experiment orchestration, incremental/stateful personalization, hardware-in-the-loop).  
- Avoid generic phrases like “prompting won’t do it”; be explicit.  
- Do not include RAG-only, prompt-gallery-only, or single-turn writing toys unless they are embedded in required orchestration/execution.  
- Output must be exactly 7 items and nothing else.

**Now generate the 7 concise ideas.**