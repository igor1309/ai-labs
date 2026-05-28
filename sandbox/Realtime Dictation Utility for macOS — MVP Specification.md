---
title: "Realtime Dictation Utility for macOS — MVP Specification"
date: 2025-11-01
model: GPT-5
version: 0.0.4
description: Self-contained architectural and behavioral specification for a macOS 26+ dictation utility supporting both OpenAI Realtime (network) and Apple on-device foundational models.
---

# Executive Summary
This document defines the minimum viable product (MVP) for a macOS 26+ utility that enables real-time speech-to-text dictation. The app behaves as a system-level assistant that listens while a global shortcut is held and inserts recognized text directly into the focused input field.  
Two implementation paths are supported:

1. **Network mode:** using OpenAI Realtime API for cloud-based transcription.  
2. **Local mode:** using Apple’s on-device Speech Transcriber / foundational speech models included in macOS 26.  

Both deliver live, multilingual streaming transcription with automatic language detection and minimal UI.

---

# Overview

## Platform Requirement
- **Target:** macOS 26 or newer (no fallback to earlier systems).

## Purpose
Create a compact, reliable dictation tool that offers instant, accurate transcription either through a **networked OpenAI backend** or via **Apple’s built-in on-device speech models**, selectable at build or runtime.

## Target Experience
- **Trigger:** Hold a global hotkey (user-selectable, e.g., Fn / Globe / any chord).  
- **Behavior:** While held, dictation runs continuously and text appears *live* in the focused field.  
- **Indicator:** Minimal three-dot animation.  
- **Release:** Key-up finalizes text and hides indicator.  
- **Configuration:** Defaults only; automatic language detection; no visible settings.

---

# Implementation Options

## 1. Network — OpenAI Realtime
- **Model:** `gpt-realtime-mini` or similar.  
- **Transport:** WebRTC / WebSocket streaming.  
- **Strengths:** High accuracy, strong punctuation, broad language support.  
- **Dependencies:** Internet connection and OpenAI API key.  
- **Cost:** ≈ $0.06 per audio minute (~ $27 / month for ~ 15 min/day use).  
- **Privacy:** Audio leaves device; session encrypted.  
- **Use case:** cloud-enhanced precision or extended language coverage.

## 2. Local — Apple Foundational Speech Models
- **Framework:** `SpeechTranscriber` and related APIs introduced in macOS 26.  
- **Execution:** Fully on-device; no network use.  
- **Strengths:** Near-zero latency, privacy-preserving, automatic language detection, tight system integration.  
- **Cost:** none.  
- **Use case:** offline or low-latency scenarios where local inference suffices.  
- **Note:** Apple models reside within system frameworks; no external downloads or setup.

Both backends expose identical event semantics — partial and final transcripts — so the same text-injection pipeline applies.

---

# Core Behavior (common to both modes)

| Phase | Action |
|-------|---------|
| **Start** | Hotkey down → activate microphone, start streaming. |
| **Partial** | Insert incremental text deltas into focused field. |
| **Final** | Replace live span with finalized text (punctuation, casing). |
| **Stop** | Hotkey up → close stream, finalize output, hide indicator. |

---

# Permissions and Entitlements
- **Microphone** — `NSMicrophoneUsageDescription`  
- **Accessibility** — for text insertion and caret control  
- **Network** — required only in OpenAI Realtime mode  

---

# Notes on Fn / Globe Key
The **Fn / Globe** key can serve as the hold-to-talk trigger.  
If macOS intercepts it for system actions, set **System Settings → Keyboard → “Press Globe key to:” → Do Nothing** to ensure clean event delivery.

---

# Future Extensions
- Command phrases (“newline”, “comma”)  
- History of transcripts  
- Optional per-app behavior profiles  
- Voice-activity-based auto-stop (post-MVP)

---

# Summary
The app targets **macOS 26+ exclusively** and supports **two interchangeable transcription engines** — cloud (OpenAI Realtime) or local (Apple foundational speech models).  
Both deliver real-time streaming text to any focused input field with a minimal, responsive user experience.