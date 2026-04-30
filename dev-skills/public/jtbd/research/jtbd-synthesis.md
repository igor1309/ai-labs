---
date: 2026-04-30
model: claude-opus-4-7
description: "Synthesized brief on Jobs-to-be-Done as a product-development framing — Christensen/Ulwick lineage, core concepts, artifacts, decisions, pitfalls, and skill-author recommendations."
---

# Jobs-to-be-Done: A Synthesized Brief for Skill Authoring

## 1. Lineage: two camps that share a name and disagree about almost everything else

JTBD is not one framework. It's two distinct intellectual traditions sharing a label, plus a handful of derivative dialects. Skill authors who don't pick a camp end up producing incoherent guidance.

**Tony Ulwick (Strategyn, ~1990, formalized in *What Customers Want*, 2005, and *Jobs to Be Done*, 2016).** Ulwick built **Outcome-Driven Innovation (ODI)** before Christensen ever wrote about jobs. His version is engineering-grade: a job is a stable *activity* a customer is trying to execute (e.g., "listen to music while driving"); customers measure success along ~50–150 quantifiable **desired outcomes**; you survey the population on importance/satisfaction; opportunity scores tell you where to invest. ODI is a *methodology* — repeatable, instrumented, market-sizing-friendly. ([anthonyulwick.com](https://anthonyulwick.com/jobs-to-be-done/), [strategyn.com](https://strategyn.com/jobs-to-be-done/))

**Clayton Christensen (HBS, ~2003, popularized in *Competing Against Luck*, 2016).** Christensen reframed jobs as **progress** — the customer is not "executing an activity," they are trying to make their life better in a specific circumstance. The milkshake story is the canonical artifact: morning commuters "hire" a thick milkshake to make a boring drive less boring and stave off mid-morning hunger. Jobs Theory is a *lens*, not a method. It's about the qualitative "why," not a measurement system. ([hbswk.hbs.edu](https://hbswk.hbs.edu/item/clay-christensens-milkshake-marketing), [christenseninstitute.org](https://www.christenseninstitute.org/theory/jobs-to-be-done/))

**Bob Moesta (The Re-Wired Group, co-architect with Christensen).** Moesta operationalized the Christensen camp via the **Switch Interview** and the **Forces of Progress** diagram. He focuses on the moment of purchase/switch, reconstructed via timeline interviews. His method is qualitative, demand-side, decision-centric. ([jobstobedone.org](https://jobstobedone.org/radio/unpacking-the-progress-making-forces-diagram/), [intercom.com](https://www.intercom.com/blog/podcasts/bob-moesta-on-unpacking-customer-motivations-with-jobs-to-be-done/))

**Alan Klement.** Took the progress/Christensen line and pushed it further into product practice — invented **Job Stories** ("When [situation], I want [motivation], so I can [outcome]") as a replacement for user stories, and explicitly opposes the persona concept. ([jtbd.info](https://jtbd.info/replacing-the-user-story-with-the-job-story-af7cdee10c27), [jtbd.info/know-the-two-very-different-interpretations](https://jtbd.info/know-the-two-very-different-interpretations-of-jobs-to-be-done-5a18b748bd89))

**The actual disagreement.** Klement himself wrote the canonical "two interpretations" essay: Ulwick = **Jobs-as-Activity** (stable tasks with outcomes); Christensen/Klement/Moesta = **Jobs-as-Progress** (situational struggles to change a life-state). They overlap on three things only: (1) the customer is not the unit of analysis — the *job* is; (2) demographics are the wrong primitive; (3) job statements must be solution-free. They diverge on everything else: granularity, stability, measurability, whether the framework prescribes a survey instrument, and even whether "job" means a verb or a noun. ([gopractice.io](https://gopractice.io/product/jobs-to-be-done-the-theory-and-the-frameworks/))

**Recommendation for skill authoring:** treat the two camps as **complementary modes**, not as alternatives the user must choose between. Use **Christensen/Moesta** for *discovery* (interviews, switch moments, positioning, why people buy). Use **Ulwick** for *prioritization* (decomposed outcomes, opportunity scores, roadmap input). Do not mix vocabulary inside one artifact. A skill that lets the user invoke each mode separately — and refuses to silently blend them — will outperform any "unified JTBD" guide.

## 2. Core concepts, defined precisely

**Job.** Something a customer is trying to get done in a recurring circumstance. Has three dimensions:
- **Functional** — the task itself ("transport groceries from store to kitchen").
- **Emotional** — how the customer wants to feel ("feel competent, unhurried").
- **Social** — how they want to be perceived ("seen as a thoughtful provider").

A "complete" job has all three; ignoring emotional/social is the single most common reason JTBD analysis ends up shallow. ([christenseninstitute.org](https://www.christenseninstitute.org/theory/jobs-to-be-done/))

**Job statement (Ulwick).** Strict grammar: **verb + object + contextual clarifier**. No technology, no brand, no method. Stable across solutions and decades. Example: "Pass on family memories to children." Counter-example (bad): "Use the photo-sharing app to send pictures." ([jtbd.one](https://www.jtbd.one/p/jobs-to-be-done-the-ultimate-guide))

**Job story (Klement).** Situational grammar: **"When [situation], I want to [motivation], so I can [expected outcome]."** Replaces persona-led user stories. Forces the author to describe context, not roles. ([jtbd.info](https://jtbd.info/replacing-the-user-story-with-the-job-story-af7cdee10c27))

**Desired outcome statement (Ulwick).** Strict grammar: **direction + metric + object of control + contextual clarifier**. Direction is "minimize" or "maximize." Example: "**Minimize** the **time it takes** to **get songs in the desired order** **for listening while driving**." Outcomes must be measurable, controllable, solution-free, and stable. A typical job decomposes into 50–150 such statements. ([jobs-to-be-done.com](https://jobs-to-be-done.com/inventing-the-perfect-customer-need-statement-4fb7de6ba999))

**Universal job map (Ulwick).** Every functional job decomposes into up to eight steps: **define → locate → prepare → confirm → execute → monitor → modify → conclude.** Useful as a checklist when generating outcome statements, since underserved opportunities cluster in specific steps. ([strategyn.com](https://strategyn.com/jobs-to-be-done/customer-centered-innovation-map/))

**Forces of Progress (Moesta).** Four vectors acting on a switch decision:
- **Push** — frustration with the current situation.
- **Pull** — attraction of the new solution.
- **Anxiety** — fear of the new (will it work? will I look stupid?).
- **Habit** — inertia of the present.

A switch happens when **Push + Pull > Anxiety + Habit**. Product work has to identify which forces dominate and design to amplify or reduce each. ([jobstobedone.org](https://jobstobedone.org/radio/unpacking-the-progress-making-forces-diagram/))

**Hire / fire.** Christensen-camp shorthand. A customer "hires" a product to do a job; when it fails, they "fire" it for a competitor — and the competitor often is *not* in the same category (milkshake competes with bagels, banana, doughnut, boredom, not other milkshakes). Forces redefinition of competitive set. ([hbswk.hbs.edu](https://hbswk.hbs.edu/item/clay-christensens-milkshake-marketing))

**Opportunity score (Ulwick).** Computed per outcome, on 1–10 importance and satisfaction scales:

**Opportunity = Importance + max(Importance − Satisfaction, 0)**

This double-weights importance and only credits the gap when there's an unmet gap. Scores >10 = opportunity; >15 = strong; >20 = extreme. Survey ~180+ customers in the target population to get stable distributions. ([roadmap.one](https://roadmap.one/blog/posts/blog8-8-opportunity-scoring/), [en.wikipedia.org/wiki/Outcome-Driven_Innovation](https://en.wikipedia.org/wiki/Outcome-Driven_Innovation))

## 3. Artifacts teams actually produce

| Artifact | Camp | Looks like | Decision it informs |
|---|---|---|---|
| **Job statement** | Ulwick | One sentence, verb+object+context | Project scope; what we're competing on |
| **Job story** | Klement | "When… I want to… so I can…" | Feature framing in the backlog |
| **Job map** | Ulwick | 8-step horizontal flow with sub-steps per step | Where in the customer's process to attack |
| **Outcome statement list** | Ulwick | 50–150 lines, direction+metric+object+context | Survey instrument; raw input to scoring |
| **Opportunity landscape** | Ulwick | Scatter plot, importance × satisfaction, with overserved/underserved zones | What to build; what to *stop* building |
| **Switch interview transcript** | Moesta | 60–90 min interview reconstructing the timeline of a recent purchase | Whether the job we *thought* we solve is actually the job customers hire us for |
| **Forces diagram** | Moesta | 4-quadrant push/pull/anxiety/habit with specific quotes | Messaging, onboarding, friction reduction |
| **Job-to-be-done canvas** | Mixed (avoid) | 1-pager smashing all of the above together | Usually nothing — too compressed to act on |

For skill authoring: each artifact has a sharp purpose. The canvas is a smell — it suggests the team hasn't decided which question they're answering.

## 4. How teams use JTBD for real decisions

**JTBD changes these decisions well:**
- *Competitive set.* "Who do we compete with?" — JTBD reframes to "what does the customer hire instead of us?" (milkshake vs. doughnut, Slack vs. email + meetings + status reports).
- *Positioning and messaging.* Switch interviews surface the actual push, which becomes ad copy and onboarding flows.
- *Roadmap prioritization.* ODI opportunity scores rank features against a measurable, customer-anchored gap rather than internal politics.
- *Feature scope at story level.* Job stories prevent persona-driven gold-plating ("As a power user, I want…") that nobody actually requests in interviews.
- *Market sizing for new entrants.* ODI's outcome-mapping reveals job populations that are *underserved on a specific outcome* — the disruption beachhead.

**JTBD does not help with:**
- Pure-tech infrastructure decisions (DB choice, refactor scope) — there's no "customer job" being executed at that layer.
- Pricing optimization (use willingness-to-pay / van Westendorp / conjoint).
- Visual design and craft details (use heuristic/usability evaluation).
- Internal team productivity tools where "the job" is genuinely solution-shaped.

**Concrete example.** Intercom adopted Klement's job stories and shipped onboarding emails based on switch interviews; the change wasn't "redesign the homepage" but "rewrite the activation copy around the customer's actual push moment." That's the right shape of JTBD-driven decision: it changes *what story we tell*, not *what stack we use*. ([intercom.com](https://www.intercom.com/blog/using-job-stories-design-features-ui-ux/))

## 5. Common pitfalls (skill should explicitly catch these)

1. **Solution-flavored job statements.** "Use our app to share photos faster" — has a brand, has a method. Strip both. The job is "Share a moment with a distant relative quickly." A skill should refuse outputs containing product names, technologies, or app verbs ("click," "swipe," "use").
2. **Persona conflation.** Demographics smuggled back in as "the busy mom," "the millennial." JTBD rejects demographics as causal. Klement: people with the same demographics make opposite choices; people with the same *job* make similar ones. ([nngroup.com](https://www.nngroup.com/articles/personas-jobs-be-done/))
3. **Mixing camps.** Writing a "Christensen-style narrative job" and then computing Ulwick opportunity scores against it. The grammars are incompatible — Christensen jobs are too coarse to be measured, Ulwick outcomes are too granular to "hire" anything.
4. **Treating the switch interview as a survey.** The Moesta interview is *one-on-one*, conversational, timeline-anchored, ~60 min. You cannot turn it into a 5-question form. Conversely, ODI without a real survey (n ≥ ~180) is just a wishlist. The instrument is the discipline.
5. **Wrong granularity.** "Be happy" is too high; "press the power button" is too low. The right level is one a single team can plausibly affect with a single product.
6. **Bundling multiple jobs.** A statement that contains "and" is usually two jobs. Split.
7. **Inventing the executor.** "B2B Omni-Channel Growth Synergist" is a department, not a person; jobs need an actual human executor or you'll generate Frankenstein workflows. ([thrv.com](https://www.thrv.com/blog/jobs-to-be-done-vs-personas-the-ultimate-guide-to-unified-customer-understanding-in-product-development))
8. **Confusing jobs with goals or pains.** "Reduce churn" is *our* goal. "Improve retention" is a pain. The job is something the *customer* is trying to do, articulated in their language.

## 6. Operating heuristics (the practitioner shortlist)

- **The job is stable; the solution changes.** If your "job statement" would have to be rewritten in five years, it's a feature, not a job.
- **No product names, no technologies, no methods in job statements.** Litmus test: would this statement have made sense in 1950? Should still make sense in 2050.
- **Interview the switch, not the satisfaction.** Ask "walk me through the day you bought it" — not "are you happy with it?" The first reveals causality; the second reveals politeness.
- **The competitor is whatever the customer fired.** Identify the previous solution. Often it's a non-product (a habit, a spreadsheet, doing nothing).
- **Push beats pull.** People rarely switch *toward* something; they switch *away from* a frustration. If you can't articulate the push, you don't yet understand the job.
- **Anxiety kills more deals than features win.** Reduce friction *of the new* before adding capability.
- **One job per statement, one outcome per outcome statement.** "And" is a code smell.
- **The verb is concrete, the object is the customer's, the context disambiguates.** "Pass on family memories" — not "preserve" (vague verb), not "memories of mine" (wrong owner), and add "to children" if the context flips the job (vs. "to a future self").
- **Get to the level you can affect.** Too abstract → unactionable. Too narrow → solutionized.
- **Start with one job at the right altitude before decomposing into outcomes.** ODI without a job-statement anchor produces opportunity lists that nobody can defend strategically.
- **Interviews come before surveys, always.** Outcomes you survey on must come from language you heard in interviews — otherwise you're scoring your own hypotheses.

## 7. Recommendation to the skill author

Build the skill in **three explicitly-named modes** rather than a single monolithic JTBD command:

1. **`jtbd-discover`** — Christensen/Moesta lens. Outputs: switch-interview question guide, forces-of-progress diagram template, job-as-progress narrative. Use when the user is at the front end ("what business are we in?", "why do customers churn?").
2. **`jtbd-decompose`** — Ulwick/ODI lens. Outputs: job statement (verb+object+context), 8-step job map, outcome list (direction+metric+object+context). Use when the user already knows the job and needs prioritization input.
3. **`jtbd-frame`** — Klement lens. Outputs: job stories ("When… I want to… so I can…") for the backlog. Use at feature-scoping time.

Hard-enforce the grammars (regex-checkable) and the no-solution / no-brand / no-demographic rules. Reject mixing of vocabularies across modes within a single artifact. Make the "you cannot apply opportunity scoring to a Christensen-style narrative job" warning explicit, because that is the single most common incoherence in the wild.

---

## Sources

- [Clay Christensen's Milkshake Marketing — HBS Working Knowledge](https://hbswk.hbs.edu/item/clay-christensens-milkshake-marketing)
- [Know Your Customers' Jobs to Be Done — HBR (Christensen et al.)](https://hbr.org/2016/09/know-your-customers-jobs-to-be-done)
- [Jobs to Be Done Theory — Christensen Institute](https://www.christenseninstitute.org/theory/jobs-to-be-done/)
- [Jobs-to-be-Done: A Framework for Customer Needs — Tony Ulwick](https://jobs-to-be-done.com/jobs-to-be-done-a-framework-for-customer-needs-c883cbf61c90)
- [Inventing the Perfect Customer Need Statement — Tony Ulwick](https://jobs-to-be-done.com/inventing-the-perfect-customer-need-statement-4fb7de6ba999)
- [Mapping the Job-to-be-Done — Tony Ulwick](https://jobs-to-be-done.com/mapping-the-job-to-be-done-45336427b3bc)
- [Jobs to Be Done: The Original Framework — Strategyn / Ulwick](https://strategyn.com/jobs-to-be-done/)
- [Outcome-Driven Innovation — Wikipedia](https://en.wikipedia.org/wiki/Outcome-Driven_Innovation)
- [Opportunity Scoring (Ulwick) — RoadmapOne](https://roadmap.one/blog/posts/blog8-8-opportunity-scoring/)
- [Replacing the User Story with the Job Story — Alan Klement](https://jtbd.info/replacing-the-user-story-with-the-job-story-af7cdee10c27)
- [Know the Two Very Different Interpretations of JTBD — Alan Klement](https://jtbd.info/know-the-two-very-different-interpretations-of-jobs-to-be-done-5a18b748bd89)
- [Unpacking the Progress Making Forces Diagram — Bob Moesta](https://jobstobedone.org/radio/unpacking-the-progress-making-forces-diagram/)
- [Bob Moesta on unpacking customer motivations — Intercom](https://www.intercom.com/blog/podcasts/bob-moesta-on-unpacking-customer-motivations-with-jobs-to-be-done/)
- [Designing Features Using Job Stories — Intercom](https://www.intercom.com/blog/using-job-stories-design-features-ui-ux/)
- [Personas vs. Jobs-to-Be-Done — NN/g](https://www.nngroup.com/articles/personas-jobs-be-done/)
- [JTBD Theory and Frameworks Explained — GoPractice](https://gopractice.io/product/jobs-to-be-done-the-theory-and-the-frameworks/)
- [Jobs-to-be-Done: Ultimate Guide to Tech Strategy — jtbd.one](https://www.jtbd.one/p/jobs-to-be-done-the-ultimate-guide)
