---
date: 2025-08-17
description: "Reusable brainstorming prompt: generate 5–7 ideas, score against user-supplied criteria, iterate up to 5 rounds."
---

# Brainstorming Blueprint – Reusable Prompt

> **Context (to be provided by the user each time)**
> - **Topic:** …
> - **Success Criteria (list):** …  
> &nbsp;&nbsp;*(e.g., “Originality, Feasibility, Cost, Wow-Factor”)*  
> - **Optional Constraints:** word limits, forbidden themes, tone, etc.

## Task
1. **Generate 5–7 distinct ideas.**  
2. For each idea:  
   - **Idea (≤ 25 words).**  
   - **Rationale (≤ 20 words)** explaining why it meets the topic or adds value.  
   - If the idea departs from any stated constraint, append “⚠︎ Deviation” at the end of the rationale.

## Immediate Evaluation Phase
3. **Rate every idea** against each *Success Criterion* using **High / Medium / Low**.  
4. **Output a Markdown table** with:  

   | # | Idea | *Criterion 1* | *Criterion 2* | … | Notes |
   |---|------|---------------|---------------|---|-------|
   | 1 | *≤ 25 words* | H/M/L | H/M/L | … | Short comment or “⚠︎ Deviation” |

   - *Use one column per criterion in the order given in Context.*  
   - Put “⚠︎ Deviation” in **Notes** (and optionally in the cell that scores “Low”).

## Filtering & Iteration Rules
5. **Drop** every idea that scores **Low** on any criterion.  
6. If fewer than **5 ideas** remain *and* the total iteration count < 5,  
   - brainstorm replacements (steps 1–4) until you again have 5–7 candidates or hit iteration 5.  
   - Re-evaluate only the **new** ideas; keep prior “Medium/High” ones unchanged.  
7. **Stop** when:  
   - you have 5–7 ideas with no Low ratings, **or**  
   - 5 iterations are completed.  
8. If no idea survives by iteration 5, return:  
   - “**Outcome:** Unable to produce acceptable ideas (all scored Low).”  
   - Brief reflection (≤ 40 words) on why.

## Formatting & Style
- Use standard Markdown only.  
- Maintain the numbered idea list **above** the evaluation table.  
- Keep language concise and professional.  
- If the provided *Optional Constraints* conflict with these defaults (e.g., stricter word caps), follow the constraints and note the change in a footnote.