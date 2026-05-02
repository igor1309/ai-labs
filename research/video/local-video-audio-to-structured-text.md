---
date: 2026-04-30
model: gpt-5
description: "Implementation note for turning video audio into structured text with local transcription and LLM post-processing"
source: https://t.me/the_ai_architect/295
---

# Local Video Audio to Structured Text

## Reference

Original source: [Telegram post](https://t.me/the_ai_architect/295)

## Implementation Shape

This is best implemented as two separate pipelines:

- Batch video or audio to structured document.
- Optional dictation-app workflow for microphone input.

## Batch Video or Audio Pipeline

The core flow is:

```text
video file
  -> extract and normalize audio
  -> transcribe locally
  -> clean transcript
  -> structure with an LLM
  -> Markdown, JSON, or document output
```

A practical implementation:

1. Use `ffmpeg` or macOS `AVFoundation` to extract audio from video:

   ```bash
   ffmpeg -i input.mp4 -vn -ac 1 -ar 16000 audio.wav
   ```

2. Run local ASR with Kesha and Parakeet:

   ```bash
   kesha --format json --vad audio.wav > transcript.raw.json
   ```

3. Feed the transcript into a second-stage LLM prompt that:

   - fixes obvious recognition errors;
   - preserves uncertain parts;
   - restores anglicisms and product names from a glossary;
   - splits content into sections;
   - extracts decisions, tasks, quotes, entities, and timestamps;
   - produces Markdown and optionally structured JSON.

4. Cache each stage by input file hash:

   ```text
   .cache/audio/<hash>.wav
   .cache/transcripts/<hash>.raw.json
   .cache/transcripts/<hash>.clean.md
   .cache/documents/<hash>.structured.md
   ```

This makes the agent workflow repeatable. If transcription already exists, only the structuring prompt needs to be rerun.

## Dictation App Workflow

A Wispr Flow replacement needs more than ASR. The quality difference usually comes from post-processing, not only the speech model.

The core flow is:

```text
microphone
  -> voice activity detection, push-to-talk, or hands-free mode
  -> streaming or chunked ASR
  -> transcript buffer
  -> LLM post-processor
  -> paste into focused app
  -> save history
```

Key parts:

- Audio capture: macOS `AVAudioEngine`.
- Activation: global hotkey plus optional hands-free mode using VAD.
- ASR: Parakeet via Kesha, CoreML, ONNX, or native library binding.
- Post-processing: local or remote LLM that rewrites raw ASR into user-ready text.
- Glossary: names, project terms, English tech words, and company terms.
- Insertion: pasteboard plus simulated paste event.
- History: SQLite table with raw transcript, cleaned transcript, app name, and timestamp.
- Provider abstraction: local LLM, OpenAI, Gemini, Anthropic, OpenRouter, or another remote API.

The important product insight is that Parakeet can be fast and good, but raw ASR is not enough for dictation. A Wispr-like experience needs a cleanup layer that understands context, grammar, mixed Russian and English speech, casing, punctuation, and intent.

## Suggested Build Order

Start with the batch video-to-document pipeline because it is simpler, testable, and immediately useful:

```bash
voice-doc input.mp4 --lang ru --style meeting-notes --out notes.md
```

Then reuse the same ASR and post-processing modules for dictation:

```bash
voice-dictate --hands-free --provider local
voice-dictate --push-to-talk cmd+shift+space --provider openrouter
```

## Source Text

```text
Про аудио

Появилась задача вытащить аудио из видео и сделать структурированный текст по этому аудио. 

Обычно, я просил агента использовать ffpmeg для извлечения аудио и далее полученный mp3 я руками кидал в ai.studio и промптил. 
Это хорошо работало, но требовало делать это руками

Вчера я решил сделать это полностью с помощью агентов локально на Маке.

Я помнил что существует некая модель parakeet и якобы она хорошо работает с ру аудио. Ок, пошёл разбираться, как запустить её локально.
В одном чатике мне подсказали использовать kesha cli https://github.com/drakulavich/kesha-voice-kit - это обёртка над тулами для работы с llm которые работают с аудио.
Попросил codex установить это и дал задачу превратить видео в структурированный текст. 
За пару минут без каких-либо проблем codex справился и отдал мне отлично структурированный документ. Кайф!

Я решил пойти дальше и попробовать заменить свой Wispr Flow (диктовалка голоса с микро в текст) и вспомнил что есть Handy. Установил его, в нём же скачал ту же модель parakeet v3, попробовал, иии.. чот на зашло! 

Да, круто что работает очень быстро и локально, но мне не понравилось, что плохо ставит окончания у слов и плохо разбирает англицизмы, а ещё чтобы говорить, нужно держать зажатыми кнопки, тут нет режима hands free. 
Всё же у wispr flow дела с этим обстоят лучше. Видимо, сказывается дополнительная пост-обработка транскрипции, которая улучшает результат и готовый текст нужно меньше редактировать.

Кстати, Валера "навайбкожу любой софт за 120 мин" Ковальский дооснащал handy и вкорячивал туда историю copy-paste и добавлял поддержку использовать любую llm по remote api. Кому интересно - приходите посмотреть.
```

## External References

- [Kesha Voice Kit](https://github.com/drakulavich/kesha-voice-kit)
- [NVIDIA Parakeet TDT 0.6B v3](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3)
