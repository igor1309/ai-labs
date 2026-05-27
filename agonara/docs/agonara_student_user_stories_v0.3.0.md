---
title: Agonara Student User Stories
date: 2026-05-26
description: Student-facing user stories for Agonara program освоения.
model: gpt-5.5-thinking
version: 0.3.0
---

# Agonara Student User Stories

## Terms

| Term | Meaning |
|---|---|
| Available program | A program visible for selection, not necessarily joined by the student. |
| Program membership | The student's participation relationship with a program, governed outside Student Workspace. |
| Program corpus | Accepted topics, concepts, materials, checks, and criteria. |
| Student state | Attempts, answers, results, weak areas, progress, and personal learning history. |

## Program Discovery

### STU-01 — See available programs

As a student, I want to see available programs of освоение so that I can choose a topic to start or explore.

Status: accepted

Acceptance signal: a student can list visible programs before joining.

### STU-02 — See started programs

As a student, I want to see programs I have already started so that I can continue learning without searching again.

Status: accepted

Acceptance signal: a student can distinguish started programs from programs not yet started.

### STU-03 — Preview program coverage

As a student, I want to see what each program covers before starting it so that I can decide whether it matches my learning goal.

Status: accepted

Acceptance signal: a program preview shows accepted topics, concepts, materials, and checks without creating student state.

## Learning Continuity

### STU-04 — Continue last session

As a student, I want to continue my last learning session so that I can return to the current topic, material, or check without reconstructing context.

Status: accepted

Acceptance signal: a student can resume from the last recorded learning position.

### STU-05 — See next learning step

As a student, I want to see the next recommended learning step so that I know what to study, repeat, or verify next.

Status: accepted

Acceptance signal: the next step is derived from accepted program structure and the student’s own state.

## Conceptual Mastery

### STU-06 — See key concepts

As a student, I want to see the key concepts, terms, principles, and definitions for a topic so that I understand what must be learned.

Status: accepted

Acceptance signal: a topic view exposes accepted concepts, terms, principles, and definitions.

### STU-07 — Distinguish similar concepts

As a student, I want to distinguish concepts that are easy to confuse so that I can avoid shallow or false understanding.

Status: accepted

Acceptance signal: confusing or related concepts can be shown together with the distinction to preserve.

### STU-08 — Identify concepts requiring deeper work

As a student, I want to mark or expose concepts that require deeper work so that I can separate memorization from understanding.

Status: accepted

Acceptance signal: weak or unresolved concepts appear in the student’s personal state without changing the accepted corpus.

## Materials

### STU-09 — See linked materials

As a student, I want to see materials linked to a topic or concept so that I can study from relevant sources instead of a flat list of links.

Status: accepted

Acceptance signal: materials are reachable from the topic or concept they support.

### STU-10 — Return from material to concepts

As a student, I want to return from a material to the concepts it supports so that reading stays connected to the program structure.

Status: accepted

Acceptance signal: material navigation preserves the link back to related topics and concepts.

## Checks and Assessment

### STU-11 — Answer quick checks

As a student, I want to answer quick checks during study so that I can verify basic understanding before moving on.

Status: accepted

Acceptance signal: quick-check results become part of the student’s personal evidence.

### STU-12 — Submit open answer

As a student, I want to submit an open answer so that my understanding can be evaluated beyond multiple-choice recall.

Status: accepted

Acceptance signal: an open answer attempt is recorded against the student and the relevant accepted check.

### STU-13 — Receive open-answer feedback

As a student, I want to receive feedback on an open answer so that I can see what is correct, missing, weak, or confused.

Status: accepted

Acceptance signal: feedback identifies strengths, missing points, weak areas, or confusion relative to accepted criteria.

### STU-14 — Pass topic-level check

As a student, I want to pass a topic-level check so that I can decide whether I am ready to continue.

Status: accepted

Acceptance signal: topic-level results indicate whether the current evidence supports moving forward.

## Results and Progress

### STU-15 — See check results

As a student, I want to see my check results so that I can understand my current level of освоение.

Status: accepted

Acceptance signal: a student can see results from prior checks in a joined program.

### STU-16 — See weak topics and concepts

As a student, I want to see weak topics and weak concepts so that I know what to repeat.

Status: accepted

Acceptance signal: weak topics and concepts are visible as personal state and link back to the program structure.

### STU-17 — See evidence behind progress state

As a student, I want to see evidence behind my progress state so that “mastered” or “weak” is not just a label.

Status: accepted

Acceptance signal: progress labels expose the attempts, answers, checks, or feedback that support them.

## Program Membership

### STU-18 — Join available program

As a student, I want to join an available program so that I can start learning it when the program membership policy permits participation.

Status: accepted

Acceptance signal: a successful join establishes student membership for the program without changing accepted program corpus.

### STU-19 — Leave active program

As a student, I want to leave a program so that it no longer appears as an active learning commitment.

Status: accepted

Acceptance signal: leaving changes membership state without deleting historical learning evidence.

### STU-20 — Resume joined program

As a student, I want to resume a program I have joined so that I can continue from my existing learning state.

Status: accepted

Acceptance signal: resuming uses existing membership and existing student state instead of creating duplicate participation.

### STU-21 — View my program membership state

As a student, I want to see whether I have joined, left, completed, or archived a program so that I understand my relationship to that program.

Status: accepted

Acceptance signal: the student can inspect membership state separately from progress or mastery state.

### STU-22 — Accept program invitation

As a student, I want to accept an invitation to a program so that I can join a curator-controlled program.

Status: accepted

Acceptance signal: accepting an invitation establishes membership only when the invitation and membership policy allow it.

### STU-23 — Decline program invitation

As a student, I want to decline an invitation to a program so that I am not added to a program I do not intend to follow.

Status: accepted

Acceptance signal: declining an invitation does not create student membership or student learning state.

## Boundaries

Student stories describe personal learning, assessment, feedback, and progress.

They do not define how the program corpus is created, curated, stored, or approved.

They do not define membership policy, invitation policy, or membership recovery.

Program corpus and student state must remain separate.

Program membership and student learning state must remain separate.
