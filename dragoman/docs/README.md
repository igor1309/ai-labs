---
date: 2026-05-01
model: claude-opus-4-7
description: "Index and workflow guide for The Dragoman channel docs"
---

# The Dragoman — Docs

This folder holds the editorial system behind the **The Dragoman** Telegram channel. Two layers, with different lifecycles.

## Foundational

Read these once to understand what the channel is. They settle and stay.

- [`the-dragoman-channel-vision.md`](the-dragoman-channel-vision.md) — founding identity, pillars, formats, boundaries.
- [`the-dragoman-name-brief.md`](the-dragoman-name-brief.md) — positioning of the name and tagline.

When the foundational docs and the post-pipeline docs disagree, the post-pipeline docs win — they are the refined, current source of truth.

## Post pipeline

Operational docs used per post. Each is consumed as a **plain prompt in a chat interface** (ChatGPT, Claude.ai, etc.), not as a Claude Code skill — chat surfaces don't support skills, so keeping these as explicit prompt files is intentional.

- [`post-pipeline/editorial-architecture-qa-prompt.md`](post-pipeline/editorial-architecture-qa-prompt.md) — stage 1.
- [`post-pipeline/the-dragoman-voice-guide.md`](post-pipeline/the-dragoman-voice-guide.md) — stage 2 reference.
- [`post-pipeline/post-image-prompt.md`](post-pipeline/post-image-prompt.md) — stage 3.

## Workflow

Three stages, each in a fresh chat window:

### Stage 1 — Editorial architecture

Inputs: a raw idea, partial draft, or unfinished thoughts about a post.

Use `post-pipeline/editorial-architecture-qa-prompt.md` as the system/first message. The model runs a Q&A, plays back the architecture, and produces a final architecture document (purpose, thesis, tension, boundaries, non-goals, recommended structure). Iterate over a few rounds if needed.

Output: an editorial architecture document.

### Stage 2 — Draft the post

Inputs: the architecture from stage 1, any initial draft, and `post-pipeline/the-dragoman-voice-guide.md` for voice.

In a new chat, the model drafts the post in The Dragoman voice, following the architecture as a hard constraint.

Output: a Telegram-ready post.

### Stage 3 — Generate the cover image

Inputs: the finished post and `post-pipeline/post-image-prompt.md`.

In a new chat (or image-capable model), fill the `{{PLACEHOLDERS}}` in the image prompt from the post and generate a 1:1 branded cover.

Output: a square cover image, stored alongside the post under `dragoman/posts/<NNNN-slug>/`.

## Reviews

Periodic quality reviews of these docs live in [`reviews/`](reviews/). Each review is dated and self-contained.

## Conventions

- Posts live in `dragoman/posts/<NNNN-slug>/` (e.g. `0001-q-and-a-session/`).
- Prompt placeholders use `{{NAME}}` syntax across all pipeline docs.
- Posts are written in Russian; channel meta (description, tagline, masthead) is in English per the name brief.
