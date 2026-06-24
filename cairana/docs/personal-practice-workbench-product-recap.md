---
title: "Personal Practice Workbench - Product Thinking Recap"
type: "product-recap"
model: gpt-5.5-high
status: "draft"
date: "2026-06-24"
source_context:
  - "solo-practitioner-pains.md"
  - "discussion: Session Record, Case Memory, Practice Projection, capability stories"
product_stage: "private XP exploration"
capability_stories_section: 9
---

# Personal Practice Workbench - Product Thinking Recap

## 1. Product Intent

A private system for the practitioner's own use, built in an XP style: small slices, fast feedback, disposable experiments, no premature market constraints.

Core intent:

> Turn raw session material into committed Session Records, maintain Case Memories, and derive Practice Projections that improve both client continuity and practitioner development.

This is not a public SaaS product at this stage. It is a personal practice workbench. Market fit, multi-user workflows, clinic administration, and commercial positioning are explicitly secondary until the private system proves useful.

## 2. Non-Goals

For the current phase, the product should not become:

- an EHR;
- a clinic platform;
- a CRM;
- an insurance/audit defensibility product;
- an autonomous therapist;
- an in-session dynamic dashboard;
- a continuous learning system;
- a generic AI note taker;
- a marketplace product;
- a multi-practitioner collaboration system.

Explicit exclusions and deferrals:

- **Insurance and audit defense** are preserved as source-context pains but not part of the current private tool direction.
- **Continuous learning** is important but belongs mainly to Agonara for now.
- **In-session cockpit/dashboard** is out of scope for at least the first several months.
- **Recording** is only relevant when explicit client consent is given.
- **Transcript reprocessing as normal workflow** is not desirable; transcripts belong mostly to archive/cold storage.

## 3. Source Pains Preserved From Research

The uploaded source document frames the broader solo-practitioner pain field. The current product direction narrows that field, but these pains should not be lost.

Base practitioner pains:

1. Holding the thread across sessions.
2. Turning each session into a usable note.
3. Carrying the data-trust burden alone.
4. Being the entire back office.
5. Tracking whether the client is improving.
6. Keeping the treatment plan linked to actual sessions.
7. Producing between-session client materials.
8. Making the record defensible for insurance and audit.
9. Managing in-room friction from recording and AI.
10. Developing skills in isolation.

Important research conclusion:

> Solo practitioners do not mainly need another CRM. The stronger pain is clinical residue: the burden of converting sessions into notes, continuity, treatment-plan updates, measurement signals, client materials, defensible records, and trustworthy workflows.

Current private-product narrowing:

- Keep: session residue, continuity, case memory, practitioner self-observation, toolbox evaluation.
- Defer: insurance/audit, payer-proofing, public compliance positioning, full practice-management automation.
- Avoid: generic AI-scribe framing as the core product identity.

## 4. Domain Vocabulary

### Raw Material Archive

Cold source archive.

Contains:

- recording;
- transcript;
- dictated note;
- typed rough note;
- handwritten note scan;
- OCR attempt;
- manual correction source.

Role:

- preserve source material;
- allow re-checking later;
- allow future regeneration with better tools;
- keep original session material out of normal daily processing.

Raw material is not the working substrate of the system.

### Session Record

Committed, compact, structured representation of what matters from one session.

Industry-adjacent mapping:

- close to **progress note**, **session note**, or **clinical note**;
- narrower than full client record;
- broader than one generated text if it also includes structured extraction.

Role:

- becomes the base artifact for normal downstream work;
- is produced as soon as possible after the session while memory is fresh;
- replaces transcript/rough notes as the working object.

### Case Memory

The longitudinal client thread.

Thread terminology is solved as:

> Thread = Case Memory.

Case Memory is not progress notes. Progress notes / Session Records feed it.

Internal structure:

- Current Case View;
- Case Journal;
- links to Session Records.

Industry-adjacent mapping:

- client record / clinical record / chart as umbrella container;
- case formulation / case conceptualization as part of current understanding;
- treatment plan as part of direction;
- case history / chart history as longitudinal evolution.

### Current Case View

The latest working understanding of the client case.

It should answer:

> What do I need to know now to work with this client?

It should stay compact and useful before a session.

### Case Journal

Chronological history of meaningful case changes.

It should answer:

> How did my understanding of this case change over time?

Mental model: Git log, not implementation requirement.

### Practice

Collection of Case Memories.

This is the practitioner's actual work corpus: real clients, real sessions, real interventions, real stuckness, real patterns.

### Practice Projection

Derived view across the Practice.

It is not a stored monolith. It is a family of recalculable views over Case Memories and Session Records.

Examples:

- toolbox evaluation;
- technique usage patterns;
- overused / underused interventions;
- weak points as practitioner;
- stuck cases;
- vague goals;
- repeated client themes;
- possible learning prompts for Agonara.

### Client Brief

Pre-session orientation generated from Case Memory and recent Session Records.

Not a dashboard. A compact brief.

### Toolbox Evaluation

Practice Projection focused on the practitioner's actual technique usage.

It should help answer:

- What techniques do I use often?
- What techniques do I avoid?
- What techniques do I mention but not apply?
- Where do I over-rely on psychoeducation?
- Where do I avoid confrontation, exposure, measurement, homework, or other hard moves?

## 5. Layer Model

The stabilized abstraction:

```text
Raw Material Archive
→ Session Record
→ Case Memory
  → Current Case View
  → Case Journal
→ Practice
→ Practice Projection
```

Alternative compact chain:

```text
Session
→ Client Case / Case Memory
→ Practice
→ Practice Projection
```

Role separation:

```text
Raw material is archived.
Session Record is committed.
Case Memory is maintained.
Practice Projection is calculated.
```

Design consequence:

- Do not make transcripts the normal working artifact.
- Do not force the system to reprocess one-hour transcripts for ordinary operations.
- Use Session Records as grounded, compact base artifacts.
- Use Case Memory for current case understanding and history.
- Use Practice Projections for analysis, not as source of truth.

## 6. Process Model

### Normal session process

```text
Session happens
→ capture raw material if available
→ produce Session Record ASAP
→ correct while memory is fresh
→ commit Session Record
→ update Case Memory
→ generate future Client Briefs
→ derive Practice Projections when useful
```

### Raw material lifecycle

Raw material belongs to archive.

It may be revisited when:

- something in a Session Record looks wrong;
- a better processing method becomes available;
- source reconstruction is needed;
- handwriting/OCR becomes good enough to recover older notes;
- model/process improvement requires sample material.

Normal workflow should not depend on constant raw-material revisiting.

### Session Record lifecycle

Session Record is the atomic durable working artifact.

It may be produced from:

- transcript;
- dictated note;
- typed note;
- OCR from handwritten notes;
- manual entry;
- any combination of the above.

The system can support multiple input modes without changing the downstream model.

### Case Memory lifecycle

Case Memory is updated from Session Records.

It has two views:

1. Current Case View: latest working understanding.
2. Case Journal: history of meaningful changes.

The journal prevents the current view from becoming polluted with every historical detail while preserving the ability to inspect how the case evolved.

### Projection lifecycle

Practice Projections are usually recalculable.

They may be generated lazily from:

- Case Memories;
- Session Records;
- accepted tags or structured fields;
- practitioner corrections.

Do not over-persist projections unless regenerating them becomes expensive or they become part of reflective practice history.

## 7. Case Memory Model

Case Memory should contain both a current view and a historical view.

### Current Case View

Candidate contents:

- current focus;
- working formulation;
- active goals;
- current strategy;
- important themes;
- active hypotheses;
- recent movement or stuckness;
- techniques currently in use;
- relevant client responses;
- open loops;
- watch-outs;
- next-session orientation.

The current view should not be a dump of all past session details.

### Case Journal

Candidate contents:

- what changed;
- what was added;
- what was removed;
- what was superseded;
- why the change happened;
- source Session Record link;
- date/session reference.

Example shape:

```text
2026-06-24
- Added: avoidance pattern around direct conflict.
- Updated: goal shifted from general anxiety relief to boundary work.
- Closed: homework review loop from previous session.
- Source: Session Record #12.
```

### Link structure

Normal inspection path:

```text
Current Case View
→ Case Journal entry
→ Session Record
→ Raw Material Archive
```

The user usually works at the top. Deep inspection remains possible.

### Important distinctions

- **Session Record ≈ progress note / session note / clinical note.**
- **Case Memory ≠ progress notes.**
- **Case Memory uses Session Records as source material.**
- **Client Record / Case Record / Chart** is the larger umbrella if professional language is needed.

## 8. Practice Projection Model

Practice Projection is the cross-case layer.

It answers:

> What does my actual practice reveal about me as a practitioner?

Useful projection families:

### Toolbox Evaluation

- techniques used often;
- techniques rarely used;
- techniques mentioned but not applied;
- techniques that appear in stuck cases;
- techniques associated with apparent movement;
- overused fallback moves;
- avoided difficult interventions.

### Stuckness Projection

- cases with no visible movement;
- cases with vague goals;
- cases with repeated loops;
- cases where next steps remain unclear;
- cases where the same intervention repeats without effect.

### Theme Projection

- recurring client themes across the practice;
- types of issues frequently appearing;
- client situations where the practitioner loses structure;
- common open loops.

### Practitioner Development Projection

- weak points suggested by actual practice;
- learning prompts for Agonara;
- modality areas needing reinforcement;
- techniques to deliberately practice;
- cases suitable for reflective review.

This is the second spine of the product:

1. client continuity;
2. practitioner self-observation.

## 9. Capability Stories

These are not a full backlog. They are practice capability stories: anchors for thinking and XP slicing.

### Session Record

```text
As a practitioner, I want to capture raw session material for a client, so that I can produce a reliable Session Record while the session is still fresh.
```

```text
As a practitioner, I want to turn a transcript, dictation, or rough note into a Session Record, so that the session becomes usable by the rest of the system.
```

```text
As a practitioner, I want to correct and commit a Session Record, so that it becomes the trusted artifact for future case work.
```

```text
As a practitioner, I want each Session Record linked to its source material, so that I can inspect the raw archive only when needed.
```

### Client Brief / Pre-Session

```text
As a practitioner, I want a client brief before the session, so that I can re-enter the case quickly.
```

```text
As a practitioner, I want the client brief to show current focus, open loops, last-session signals, and possible next moves, so that I enter the session oriented.
```

```text
As a practitioner, I want to generate the brief from Case Memory rather than rereading progress notes, so that preparation stays fast and focused.
```

### Case Memory

```text
As a practitioner, I want committed Session Records to update Case Memory, so that the current understanding of the client stays fresh.
```

```text
As a practitioner, I want to see what changed in Case Memory after a session, so that I can understand how the case evolved.
```

```text
As a practitioner, I want a Current Case View, so that I can see the latest working understanding without historical clutter.
```

```text
As a practitioner, I want a Case Journal, so that I can review the history of meaningful changes without rereading every Session Record.
```

```text
As a practitioner, I want Case Journal entries linked to Session Records, so that I can inspect the evidence behind a case-memory change.
```

### Practice Projection

```text
As a practitioner, I want to evaluate my toolbox across cases, so that I can see which techniques I use, avoid, or overuse.
```

```text
As a practitioner, I want to see repeated stuckness patterns across cases, so that I can identify weak points in my practice.
```

```text
As a practitioner, I want to see which cases have vague goals or unclear next steps, so that I can tighten the work.
```

```text
As a practitioner, I want to see which techniques appear in cases with movement or stuckness, so that I can reflect on what seems useful in my actual work.
```

```text
As a practitioner, I want practice projections to generate learning prompts for Agonara, so that my study follows weaknesses visible in real practice.
```

### Trust / Recording

```text
As a practitioner, I want recording to be clearly consent-based, so that session capture does not silently damage the therapeutic room.
```

```text
As a practitioner, I want raw recordings and transcripts treated as archive material, so that normal practice work does not constantly expose unnecessary client detail.
```

### Between-Session Material

```text
As a practitioner, I want the system to derive possible homework or client material from Session Records and Case Memory, so that between-session work stays connected to the actual case.
```

```text
As a practitioner, I want client materials to be generated from the current case context, so that they are not generic worksheets detached from the work.
```

## 10. Candidate First XP Slice

The strongest first slice is not the full system.

Candidate first slice:

```text
Select client
→ add rough note or transcript
→ generate Session Record
→ edit/correct
→ commit
→ generate next-session Client Brief from that Session Record
```

Why this slice:

- proves capture-to-record flow;
- avoids large architecture;
- creates immediate personal value;
- establishes Session Record as base artifact;
- postpones complex Case Memory automation;
- keeps raw transcript out of downstream normal flow.

Candidate second slice:

```text
Committed Session Record
→ proposed Case Memory update
→ Current Case View + Case Journal entry
→ next Client Brief uses Case Memory instead of only last Session Record
```

Candidate third slice:

```text
Multiple Case Memories
→ Practice Projection
→ Toolbox Evaluation
```

## 11. Decision Log

Resolved decisions:

- Product is private-first, not market-first.
- Build with XP: small steps, fast iteration, disposable experiments.
- Do not begin with a full user-story backlog.
- Do not center the product around generic AI note-taking.
- Do not make in-session dashboard/cockpit an early direction.
- Raw material is archive, not normal working substrate.
- Session Record is the durable working artifact after a session.
- Threads are renamed to Case Memories.
- Case Memory has two layers: Current Case View and Case Journal.
- Progress notes map to Session Records, not Case Memory.
- Practice is the collection of Case Memories.
- Practice Projection is cross-case analysis.
- Toolbox Evaluation is a key Practice Projection.
- Agonara remains the primary continuous-learning system; this product may feed it with practice-derived prompts later.

## 12. Open Questions

Current high-value questions:

1. What is the minimum useful Session Record shape?
2. What belongs in Current Case View vs Case Journal?
3. Should the first version of Case Memory update be fully manual, assisted, or generated as a proposed diff?
4. Should Practice Projection calculate primarily from Session Records, Case Memories, or both?
5. What is the smallest useful Toolbox Evaluation?
6. What raw material should be retained by default?
7. How much source-linking is enough without turning the tool into an EHR clone?
8. What exact client brief is useful before session without becoming a dashboard?
9. Which parts should be ephemeral projections and which should be saved reflective artifacts?
10. How should consent-based recording be handled without overbuilding compliance machinery?

## 13. Compact Architecture Statement

```text
Raw Material Archive
  cold source material; rarely visited

Session Record
  committed session-level working artifact

Case Memory
  longitudinal client memory
  = Current Case View + Case Journal + Session Record links

Practice
  collection of Case Memories

Practice Projection
  recalculable cross-case views for practitioner self-observation
```

One-line product definition:

> A private practice workbench that converts session residue into durable Session Records, maintains Case Memories, and projects across the Practice to help the practitioner work with clients more coherently and improve from their own real cases.
