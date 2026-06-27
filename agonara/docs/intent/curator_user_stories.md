---
title: Agonara Curator User Stories
date: 2026-05-26
description: Program curator user stories for Agonara program освоения.
model: gpt-5.5-thinking
version: 0.3.0
---

# Agonara Curator User Stories

## Terms

| Term | Meaning |
|---|---|
| Program curator | The role responsible for collecting, refining, and accepting program content. |
| Program corpus | Accepted topics, concepts, materials, checks, and criteria. |
| Draft suggestion | Candidate content not yet accepted by the program curator. |
| External source | Public plan, exam requirement, standard, material, link, or research finding used to inform the program. |
| Program membership | Participation relationship between an identity and a program, governed outside Curator Workspace. |

## Program Curation

### CUR-01 — Create program from grounded sources

As a program curator, I want to create a program of освоение from public plans, exam requirements, standards, materials, and research findings so that the program has a grounded structure.

Status: accepted

Acceptance signal: a curator can create a program and attach the source set used to justify its initial structure.

### CUR-02 — Add topics and concepts

As a program curator, I want to add topics and concepts to a program so that the learning scope is explicit.

Status: accepted

Acceptance signal: the program corpus shows accepted topics and concepts separately from unaccepted drafts.

### CUR-03 — Link materials to topics and concepts

As a program curator, I want to link materials to topics and concepts — each material either a reference to an external source or content hosted in the program — so that students know why each material is included.

Status: accepted

Acceptance signal: each accepted material can show the topic or concept it supports.

### CUR-04 — Add checks and assessment items

As a program curator, I want to add checks and assessment items to topics so that understanding can be verified.

Status: accepted

Acceptance signal: a topic can include accepted checks that students can use to verify understanding.

### CUR-05 — Define assessment criteria

As a program curator, I want to define criteria for checks and open-answer assessment so that evaluation is tied to the program, not improvised per attempt.

Status: accepted

Acceptance signal: a check or open-answer prompt can reference accepted criteria owned by the program corpus.

### CUR-06 — Keep accepted content separate from drafts

As a program curator, I want to keep accepted program content separate from drafts and suggestions so that the corpus remains controlled.

Status: accepted

Acceptance signal: draft suggestions do not appear as accepted corpus content until the curator explicitly accepts them.

## Research and Program Expansion

### CUR-07 — Add external sources

As a program curator, I want to add external sources to a program so that the program can be grounded in public plans, requirements, materials, and research.

Status: accepted

Acceptance signal: an external source can be recorded with enough metadata to explain why it informed the program.

### CUR-08 — Extract candidate structure from sources

As a program curator, I want to derive candidate topics, concepts, and checks from external sources so that research can become usable program material.

Status: accepted

Acceptance signal: extracted candidates remain reviewable drafts until accepted into the program corpus.

### CUR-09 — Identify coverage gaps

As a program curator, I want to see gaps in topics, concepts, materials, or checks so that the program can be improved deliberately.

Status: accepted

Acceptance signal: the curator can see missing or weak coverage areas without treating them as accepted content.

### CUR-10 — Update program after research

As a program curator, I want to update the program after additional research so that the program can evolve without rewriting the student’s personal state.

Status: accepted

Acceptance signal: accepted corpus changes do not erase or overwrite existing student attempts, progress, or learning history.

## LLM Assistance

### CUR-11 — Use LLM assistance for program structuring

As a program curator, I want LLM assistance when researching and structuring a program so that I can discover candidate topics, concepts, materials, checks, and gaps faster.

Status: accepted

Acceptance signal: LLM output is captured as candidate material with clear draft status.

### CUR-12 — Review LLM suggestions

As a program curator, I want to review and accept or reject LLM suggestions so that generated content does not automatically become part of the program.

Status: accepted

Acceptance signal: accepting or rejecting an LLM suggestion is an explicit curator action.

### CUR-13 — Trace suggestion origin

As a program curator, I want to see why a suggestion was proposed so that I can judge whether it belongs in the program corpus.

Status: accepted

Acceptance signal: a suggestion exposes its source, prompt context, or supporting evidence before acceptance.

## Program Membership

### CUR-14 — Invite student to program

As a program curator, I want to invite a student to a program I curate so that the student can participate in a controlled program.

Status: accepted

Acceptance signal: the invitation is recorded as program membership state and does not by itself create student learning state.

### CUR-15 — See invited students

As a program curator, I want to see pending and accepted invitations for a program so that I understand who can participate.

Status: accepted

Acceptance signal: invitation state is visible separately from accepted program corpus and student progress.

### CUR-16 — See program participants

As a program curator, I want to see current participants in a program I curate so that I understand who is using the program.

Status: accepted

Acceptance signal: participant visibility reflects membership state without exposing private student learning state.

### CUR-17 — Remove student from curator-controlled program

As a program curator, I want to remove a student from a program I curate so that I can manage participation in that program.

Status: accepted

Acceptance signal: removal changes membership state without deleting historical learning evidence.

### CUR-18 — Stop curating a program

As a program curator, I want to stop curating a program so that I am no longer responsible for its content decisions.

Status: accepted

Acceptance signal: stopping curator participation changes program membership state without mutating accepted corpus content.

### CUR-19 — Host readable material content

As a program curator, I want to load or derive the readable content of a material into the program — warranting that I hold the rights to store and share it — so that students and I can read the material in-product instead of depending on an external or agent-local copy.

Status: accepted

Acceptance signal: a curator can store, read, and delete a source's content and set the accepted content of a material reference, and that content is served to students through the program; Agonara does not gate the content on licensing.

## Boundaries

Curator stories describe creation, refinement, and acceptance of program content.

They do not describe the student’s attempts, results, progress, weak areas, or learning history.

They do not define membership policy, invitation policy, or membership recovery.

Program corpus and student state must remain separate.

LLM suggestions are draft material until accepted by the program curator.
