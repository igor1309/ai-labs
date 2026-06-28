# Draft concept extraction — build a concept layer that covers the whole topic

A procedure for proposing **concept** candidates that cover a topic's full
teachable content, not just its core. Use it whenever the curator hands you a
topic (overview, body, and its student-visible materials) and wants a concept
layer drafted — propose the results as concept corpus candidates through the
normal draft↔accepted flow in [`SKILL.md`](SKILL.md).

## Why this exists

The common failure is not bad source material or a wrong goal — it is a
**silently weak internal Definition of Done**. The agent substitutes "the core
of the topic is sketched" for "the topic's teachable content is covered," stops
at four or five obvious concepts, and reports done. The result is a handful of
labels, not a concept layer.

The fix is to hold an explicit DoD and to **prove coverage with a gap check**,
not to declare it. "There are a few good concepts" is never done. Done = the
topic's substantive blocks are each either represented by a concept or
consciously left out for a stated reason.

## The bar is two-sided

Hold both edges at once — this is not "always make more concepts":

- **Coverage** — no substantive block of the topic is missing from the concept
  layer. Under-extraction is the failure this procedure mainly targets.
- **Granularity** — no concept silently swallows two or three independent
  teachable ideas, and no idea is split into micro-concepts that carry no
  separate learning value. Over-fragmentation is the opposite failure; the
  merge/trim pass (Step 4) guards it.

## Procedure

Do the steps in order. Do not start drafting concepts before the topic is
segmented (Step 2) — drafting from a half-read corpus is how blocks get missed.

### 1. Read the full topic corpus

Read all of it before extracting anything:

- the topic overview and `body`,
- every student-visible material attached to the topic (hosted content and
  linked readings),
- related standards / supporting sources **only if** they add teachable
  structure to the topic, not merely cite it.

### 2. Enumerate the topic's semantic blocks

Write down the topic's major semantic blocks first — a map of *what the topic is
made of* — before naming any concept. A block is a coherent chunk of subject
matter (e.g. a historical/origin block, a normative-principle block, a
procedural-mechanism block, a risks/safeguards block). Generate the block
categories *from this topic*; do not reuse a fixed checklist from another topic.

### 3. Extract teachable units per block

For each block, identify its **teachable units**. A teachable unit is one idea,
principle, mechanism, distinction, or rule the student should understand as a
unit. For each, decide: does it deserve its own concept, or is it a sub-part of a
larger concept? Do not leave large blocks as undivided lumps, and do not promote
purely bibliographic, editorial, or administrative material into a concept.

### 4. Draft candidates, then merge/trim

Draft a candidate concept for each teachable unit that earns one —
`title`, `body` (a short, clear definition), and `rationale` (why it is a
separate concept in this topic). Then make one deliberate pass for balance:

- **Anti-compression rule.** Do not fuse independent teachable units into one
  concept for brevity, and do not stop at "4–5 obvious concepts" when the
  material is wider. An organizational aspect, a normative principle, and a
  procedural mechanism are different concepts when they are taught distinctly.
- **Merge only when pedagogically justified** — when the student needs no
  separate unit of understanding, the distinction is too fine for the topic's
  level, or one concept fully serves another and is never taught on its own.
- **Trim** only what is not teachable, is purely administrative, or duplicates an
  existing concept.

In Agonara terms, a "merge vs. keep separate" decision is a granularity choice
about how `topic_includes_concept` relationships will fan out under the topic —
make the call on teaching value, not on count.

### 5. Mandatory coverage gap check

This step is not optional; skipping it is the original failure. Walk
`semantic blocks → teachable units → concepts` and mark every block:

- **covered** — represented by a concept,
- **intentionally merged** — folded into another concept for a stated reason,
- **missing** — not reflected anywhere in the concept layer.

Any **missing** block means the work is not done — return to Step 3 for it. This
is your own reasoning pass over the source material against the concepts you are
drafting; do not wait for a tool to tell you what is missing. (The
`coverage-gaps` diagnostic in
[`agonara-curator-research`](../agonara-curator-research/SKILL.md) answers a
different question — structural gaps in the *accepted* corpus, e.g. an accepted
topic with no concept links — so it belongs after acceptance, not in this draft
gap check.)

## Definition of Done

The draft concept layer is done only when **all** hold:

- every substantive semantic block of the topic is covered;
- every independent teachable unit is either a concept or consciously merged for
  a stated reason;
- no large piece of the topic's material is absent from the concept layer
  entirely;
- the merge/trim pass ran — no concept hides several distinct ideas, and there is
  no needless micro-splitting;
- the set reads as the topic's teaching structure, not as a list of a few labels.

**Anti-failure rule.** "There are a few good concepts" is not done. Done is
coverage of the full topic.

## Hand-off

These are **draft** concepts. Propose each as a `concept` corpus candidate
through the *Topics and concepts — corpus candidates* flow in
[`SKILL.md`](SKILL.md), carrying its `rationale`. Then **stop at the acceptance
gate** (see *The acceptance gate* in [`SKILL.md`](SKILL.md)): present each
candidate as read back from the API and the coverage gap-check as a
per-block→candidate-id mapping the curator can verify against the source — not as
a claim that coverage holds — and wait for their per-entity go-ahead before
accepting or linking anything. Do not accept in the run you proposed, and do not
treat a correct-looking layer as if it were accepted; "not proven wrong" is not
"trusted." Extraction never auto-accepts (CUR-06): a human-owned, verified
acceptance is what moves any concept into accepted corpus.
