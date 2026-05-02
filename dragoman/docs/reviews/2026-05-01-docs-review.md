---
date: 2026-05-01
model: claude-opus-4-7
description: "Quality review of dragoman/docs — content, consistency, scope, and gaps across the editorial system"
---

# Quality Review: `dragoman/docs/`

Five docs, ~700 lines total. The system is thoughtfully designed but has overlap, drift, and missing connective tissue. Findings ordered by impact.

---

## Cross-cutting issues

### 1. ⚠️ Two voice specs, no clear precedence
**Files:** `channel-vision.md:123-143` and `voice-guide.md:10-34`

`channel-vision` describes voice as "personal; exploratory; precise; skeptical without being cynical; practical without being shallow…" — a soft, generic list.

`voice-guide` describes voice as "direct, slightly ironic, practical, and observant" with rough rhythm, mild irony, controlled roughness, allergic to hype. **Irony and roughness are core in voice-guide, absent in channel-vision.**

A reader following only `channel-vision` would write the wrong voice. Pick one as canonical (likely `voice-guide`) and have the other defer with a one-line cross-reference, e.g.: *"Voice — see [voice guide](voice-guide.md). Summary: …"*.

### 2. ⚠️ Three different "post structure" specs
- `channel-vision` §Post formats — five formats (field report = task → setup → what happened → …)
- `voice-guide` §Structure — one universal shape (hook → situation → problem → move → ending)
- `editorial-architecture-qa-prompt` — generates structure per post via Q&A

Each is internally coherent, but no doc tells the writer which to follow when. Are the channel-vision formats *containers* and the voice-guide shape the *rhythm inside them*? Or is the Q&A prompt the source of truth that overrides both? **Add a short integration note** clarifying the relationship — likely: "use Q&A prompt to pick a format from channel-vision; voice-guide governs rhythm inside whichever format."

### 3. ⚠️ No README / index for the docs folder
Five overlapping docs with no map. Adding `dragoman/docs/README.md` (~10 lines) listing each file's role and ownership would prevent future contributors from drifting or duplicating.

### 4. ℹ️ Missing workflow document
The pipeline `idea → architecture (Q&A) → draft (voice guide) → image (image prompt) → publish under posts/<NNNN-slug>/` exists implicitly across files but is documented nowhere. The post-folder numbering convention itself (`0000-`, `0001-`, `0002-`) is also undocumented.

### 5. ℹ️ Inconsistent placeholder syntax
- `editorial-architecture-qa-prompt.md`: `{{IDEA-DRAFT}}`
- `post-image-prompt.md`: `[MAIN_TITLE]`, `[POINT_1]`

Pick one. Mustache-style `{{…}}` is more conventional for prompt templates and less likely to be confused with example output.

---

## `channel-vision.md`

### 6. ⚠️ Suggested pinned post and tagline are deliverables embedded in a vision doc
Lines 205-221: pre-baked Telegram description and pinned post sit alongside principles. These are artifacts to ship, not principles to reason from. Move to `posts/0000-launch/` (where the launch image already lives) or a separate `channel-meta.md`, leaving the vision doc principle-only.

### 7. ℹ️ Pillar 6 is structurally a guardrail, not a pillar
Lines 117-121: "Occasional reflection — rare, sharp … should not become the main product." A pillar that says "don't lean on this" isn't a pillar. Either demote to a §Cautions section or own it as a real pillar with positive framing.

### 8. ℹ️ §Long-term shape is brainstorm, not strategy
Lines 256-273: 8 unranked future branches with no criteria. As-is, this is a wishlist that adds noise. Either drop or annotate ("trigger: when [condition]").

---

## `name-brief.md`

### 9. ⚠️ Naming stress test mixes scoring and mitigation
Line 150: `| AI relevance | Requires subtitle/tagline |` — every other row is a strength rating ("Strong"/"Low risk"). This row is a mitigation note, not an assessment. Either rate it ("Weak — mitigated by tagline") or split into two columns (Score | Mitigation).

### 10. ℹ️ Telegram description duplicated across docs
Line 162 (`name-brief`) and line 207 (`channel-vision`) state the same description verbatim. Pick one source and reference it from the other.

### 11. ℹ️ "What the name is not" overlaps with `channel-vision` Out-of-scope
The two lists are similar but not identical. They serve different framings (positioning vs. editorial scope), but the differences aren't called out. Either state the distinction explicitly or merge.

---

## `voice-guide.md`

### 12. ⚠️ §Rhythm and §Sentence style say the same thing twice
- §Rhythm (lines 114-145): mixed rhythm, long sentences allowed, short lines as accents, avoid chopping for theatrics, with example.
- §Sentence style (lines 247-277): mixed rhythm, long sentences allowed, short lines as accents, avoid bureaucratic chains, with example.

Same lesson, two versions. Pick one location (Rhythm is the better home), fold the bureaucratic-chain bad-example into it, delete the other.

### 13. ⚠️ §Compact prompt for future posts will drift
Lines 326-350: a bulleted prompt that paraphrases the entire doc above. The moment any rule above changes, the compact prompt becomes stale silently. Either:
- generate it from the source of truth, or
- add a "if you change the rules above, update this block" comment, or
- reference the doc instead: "Voice rules: see voice-guide §Core voice + §Basic stance + §Rhythm".

### 14. ℹ️ Russian-only constraint is implicit
The doc is written in English but assumes posts are in Russian (line 41: "Use living Russian"). Channel-vision and name-brief never declare a language. State it once at the top: *"Posts are written in Russian. Channel meta (description, tagline) is in English per the name brief."*

---

## `editorial-architecture-qa-prompt.md`

### 15. ⚠️ Playback schema and final-output schema don't match
- Playback (lines 87-97): clarified purpose, JTBD, thesis, tension, misunderstanding, argument map, boundaries, non-goals, expected output format, recommended structure. (10 items)
- Final output (lines 109-120): adds *title/working angle* and *open risks or weak spots*; drops *expected output format*. (11 items, partially overlapping)

A model strict-following the playback contract will be surprised when the final asks for items not confirmed. Either align the two schemas, or explicitly state "final adds title and risks on top of confirmed playback."

### 16. ⚠️ Tag semantics for А/Б/В options are undefined
Line 62: *"Each option must include a concise tag, e.g. `core`, `simple`, `strict`, `complex`, `recommended`."*

These tags mix dimensions: `simple`/`complex` is a complexity axis, `core` is a property, `recommended` is meta-guidance, `strict` is a posture. Without a defined taxonomy the model will improvise inconsistently across questions. Either define 3-5 tags with stable meanings, or drop tags entirely and let the option text speak.

### 17. ⚠️ "Automatic patching" trigger undefined
Line 135: *"Apply the patch only after I approve it, unless I explicitly asked for automatic patching."*

Nowhere in the doc is "automatic patching" defined as an opt-in. The model will not know what phrase the user must say to enable it. Either define the trigger (`"if I said 'auto-patch' at the start"`) or drop the conditional.

### 18. ℹ️ Bilingual structure is jarring
Russian opening (lines 11-21) → English headings/rules. The model will likely respond in Russian (good — that's the intent) but the binding rules in English create a register mismatch. Consider Russian-only or English-only with the language directive as the first line.

### 19. ℹ️ "Do not write the post" repeated three times
Lines 27, 29, 69. Once is enough.

---

## `post-image-prompt.md`

### 20. ⚠️ "Do not use gates" — meaning unclear
Line 24. Likely a typo (`gradients`?) or jargon for something else. As written, an LLM has no idea what to avoid. Clarify or remove.

### 21. ⚠️ `model: got-5.5-thinking` typo
Line 3 — should be `gpt-5.5-thinking`.

### 22. ⚠️ No instruction that placeholders must be replaced before sending
The doc reads as a prompt to be used as-is, but contains `[MAIN_TITLE]`, `[POINT_1]`, `[ILLUSTRATION_CONCEPT]` etc. A reader following the doc literally will paste a template full of brackets into an image model. Add a one-line preamble: *"Replace every [PLACEHOLDER] before sending. The bracketed names mark required inputs."*

### 23. ℹ️ Masthead casing inconsistent with other docs
Line 16: `THE DRAGOMAN`. Other docs render it `The Dragoman`. Defensible (mastheads have their own typography) but worth a one-line note: *"Masthead is set in all caps as a brand mark; in prose the channel is The Dragoman."*

### 24. ℹ️ Lone `version: 0.0.1` field
No other doc is versioned. Either add versioning project-wide as a convention or drop this field.

---

## Summary recommendation

Two highest-leverage fixes:

1. **Add `dragoman/docs/README.md`** declaring source-of-truth ownership: voice → voice-guide; identity → channel-vision; positioning → name-brief; pre-draft architecture → Q&A prompt; image production → image prompt. Cross-references replace duplications.

2. **Reconcile voice and structure across `channel-vision` and `voice-guide`** so a writer can't follow one and miss the other. Cleanest: `channel-vision` keeps formats and pillars only, defers all "how to write" to `voice-guide`.

The rest are tightening passes — none are blocking, but the duplications (#1, #10, #12, #13) will rot if left.

---

## Actions taken in response (2026-05-01)

- **#3, #4** — addressed: added `dragoman/docs/README.md` with index + workflow + foundational/pipeline split.
- **#1** — addressed via a cross-reference: `channel-vision.md` now declares `voice-guide` authoritative when they diverge. The vision text itself is preserved as a founding document.
- **#5** — addressed: placeholders unified to `{{PLACEHOLDER}}` in `post-image-prompt.md`.
- **Folder restructure** — operational docs moved to `dragoman/docs/post-pipeline/`; foundational docs stay at the top level.

Findings #2, #6–#24 left for future tightening passes.
