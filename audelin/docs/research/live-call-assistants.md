# Products that assist during a live call

Research for LAB-1791, 2026-11-24. The question is which products help a
person while a call is still going on, and how they do it. The answer feeds a
later choice of strategy for an assistant that follows a live Audelin
transcript and offers hints from the web, local files and repositories.
Building that assistant is out of scope here (see LAB-1033, LAB-1530,
LAB-1256).

Method: web search over vendor documentation and engineering material, plus
reading the source of the open-source projects at their `main` branch on
2026-11-24. Vendor claims are self-reported unless marked as read in code.
"Not found" means the vendor publishes nothing on it that this search could
reach.

## Survey

### Fireflies Live Assist (meeting note-taker)

- **Help during the call:** a floating pane (desktop app) or Chrome-extension
  pane with the live transcript, real-time notes, suggested questions, and
  answers to questions pulled from the user's knowledge base. A "Sales Assist"
  variant targets sales calls. Works without the Fireflies bot joining.
- **Speak or stay quiet:** not documented. Suggestions appear in the pane
  without an explicit trigger. Answers are on request.
- **Transcript consumption:** not documented.
- **Context:** the user's own Fireflies knowledge base and past meetings.
  How that context is retrieved is not documented.
- **Display:** a side pane or floating pane, visible only to the user.
- **Latency, cost, quality:** no published numbers.
- Sources: [Live Assist](https://guide.fireflies.ai/articles/6032274417-learn-about-fireflies-live-assist-get-real-time-suggestions-answers-and-notes-live-during-the-meeting),
  [desktop app](https://guide.fireflies.ai/articles/2679406774-live-assist-sales-assist-fireflies-desktop-app-real-time-notes-answers-suggestions),
  [Chrome extension](https://guide.fireflies.ai/articles/7077919424-explore-the-real-time-pane-on-the-fireflies-chrome-extension).

### Microsoft 365 Copilot in Teams meetings

- **Help during the call:** answers questions on request ("Recap the meeting
  so far", custom questions). It also nudges anyone who joins more than 5
  minutes late to get a catch-up summary.
- **Speak or stay quiet:** silent unless asked. The late-join notification
  is the only push.
- **Transcript consumption:** draws on the live transcript plus meeting chat
  from up to 24 hours before the meeting. Without a transcript it can use
  only the chat. Microsoft publishes no limit on how much transcript it reads
  and does not say whether it rereads the whole transcript or summarises it.
- **Context:** the meeting chat. The wider Microsoft Graph applies only to
  general Copilot, not to these meeting answers.
- **Display:** a Copilot side panel in the meeting.
- **Latency, cost, quality:** no published numbers. Gartner names transcript
  accuracy as the main dependency.
- Sources: [Use Copilot in Teams meetings](https://support.microsoft.com/en-us/office/use-copilot-in-microsoft-teams-meetings-0bf9dd3c-96f7-44e2-8bb8-790bedf066b1),
  [Catch up on meetings](https://support.microsoft.com/en-US/teams/copilot/catch-up-on-meetings-with-microsoft-365-copilot-in-teams),
  [Gartner abstract](https://www.gartner.com/en/documents/5634091).

### Otter.ai

- Streams a live transcript that participants can annotate. Comparisons
  describe in-call help as minimal next to Fireflies. Nothing found on how it
  consumes the transcript or brings in context.
- Sources: [Wikipedia](https://en.wikipedia.org/wiki/Otter.ai),
  [Fireflies vs Otter (vendor comparison)](https://fireflies.ai/blog/fireflies-vs-otter).

### Cluely (sales and interview copilot)

- **Help during the call:** live coaching and answers in an overlay that only
  the user sees. No bot joins the call.
- **Everything else:** Cluely publishes no technical documentation. Its
  open-source clones (below) show how this category is built.
- Source: [third-party comparison](https://builts.ai/blog/cluely-vs-fathom-vs-otter-vs-fireflies/).

### Natively (open-source Cluely-style copilot; source read)

Source available under a personal-use licence.
[Repo](https://github.com/Natively-AI-assistant/natively-cluely-ai-assistant).

- **Help during the call:** answers to interviewer questions, coding help and
  screenshot answers, in an overlay hidden from screen shares. An optional
  "Auto Answer" decides on its own whether to answer.
- **Speak or stay quiet:** Auto Answer runs an LLM "judge" on each candidate
  utterance (`electron/main.ts`, `judgeCandidate`, with a premium decider
  cascade around it). Otherwise answers come on a hotkey.
- **Transcript consumption (read in code):** layered.
  - Prompts read a recent window by time: `getContext(lastSeconds = 120)` in
    `electron/IntelligenceManager.ts`, and a rolling ~180 s window for intent
    hints. Only the last one or two interviewer turns go into the hint,
    because the whole window "caused topic-bleed" (comment in `main.ts`).
  - `TemporalContextBuilder.ts` keeps the last 5 context items.
  - For "summarise the meeting so far", each block of 400 spoken lines is
    summarised once, in the background, after any answer in flight. Up to 60
    such recaps are kept and nothing is evicted (`SessionTracker.ts`,
    `RECAP_BLOCK_LINES`, `MAX_RECAPS`). The comment says the old path answered
    from "six retrieved windows, a few minutes of a long meeting", which is
    why recaps were added.
  - Past meetings are embedded locally in SQLite vector search (RAG).
- **Context:** a notes field of up to 8,000 characters injected into every
  prompt, reference files (PDF, DOCX, TXT), local RAG over past meetings, and
  web search on the paid plan.
- **Display:** an overlay window with a rolling transcript bar.
- **Latency:** claims "<500ms", which reads as audio capture latency rather
  than answer latency. No measurement is published.

### Glass by Pickle and Pluely (open-source Cluely clones)

- Glass is a fork of CheatingDaddy: an invisible overlay that listens to the
  call and answers. The `pickle-com/glass` repository was unreachable
  (404) on 2026-11-24, so its code was not read.
- Pluely is a Tauri/React equivalent. Its transcript handling was not read.
- Sources: [Glass README mirror](https://cdn.jsdelivr.net/gh/pickle-com/glass@main/README.md),
  [Pluely](https://github.com/tarunerror/pluely),
  [topic: open-source-cluely](https://github.com/topics/open-source-cluely).

### MeetingBro (open-source local note-taker; source read)

[Repo](https://github.com/armpro24-blip/MeetingBro). Local Whisper, with any
OpenAI-compatible LLM for summaries.

- **Help during the call:** live transcript, translation, and summaries that
  refresh on their own. It offers no question answering or retrieval.
- **Speak or stay quiet:** summaries run on a cadence, gated by a minimum
  segment count and by a "governor" that skips background jobs when the
  machine is loaded. It does not trigger on content.
- **Transcript consumption (read in code,
  `app/backend/meetingbro/session/manager.py`):** three summaries run in
  parallel, each with its own cadence. The defaults are in `main.py`.

  | Summary | Cadence | Input | Carries forward |
  |---|---|---|---|
  | `rolling_summary` | every 60 s | segments in the last 180 s window, then **only segments newer than the previous rolling summary's end** | the previous rolling summary |
  | `meeting_memory` | every 120 s | all segments since the last memory update (incremental) | the previous memory (compressed) |
  | `cumulative_meeting_summary` | every 180 s | the last 120 s of raw transcript (`summary_tail_seconds`) | the compressed memory |

  The code comment on the cumulative summary reads: "Long meetings should not
  send the full transcript to the LLM for every cumulative/final summary. The
  compressed memory carries durable state; this tail preserves fresh wording
  and unsummarized details." The rolling summary avoids overlap on purpose:
  "re-sending those segments just causes the LLM to repeat already-summarized
  content."
- **Context:** none beyond the transcript, apart from a static vocabulary
  hint for Whisper.
- **Display:** an Electron window with transcript and summary panes. A
  "Summary only" mode hides the live transcript on weak machines.
- **Latency, cost, quality:** not measured. Cadences are configurable per
  profile.

### nlinc1905/meeting-helper (open source; source read)

- Prints a rolling summary every N audio buffers (`--summary-buffers`,
  `nbr_past_buffers_to_summarize` in `asr_w_rolling_summary.py`). Each summary
  covers the last N buffers only, a non-overlapping fixed window, and does
  not carry forward an earlier summary. After the call the transcript becomes
  a RAG index for Q&A.
- [Repo](https://github.com/nlinc1905/meeting-helper).

### Meetily (open-source local note-taker)

- Live transcript with Whisper or Parakeet. Summaries are generated after the
  call with Ollama or a cloud model. MCP, CLI and webhook integrations are in
  the paid Pro edition. It gives no in-call hints.
- [Repo](https://github.com/Zackriya-Solutions/meetily).

### Zoom Arlo (open-source reference app)

- A Zoom Apps reference that uses RTMS (real-time media streams) for live
  transcription without a bot. It offers AI summaries and action items in
  verticals (notes, healthcare, legal, sales). Its transcript strategy was not
  read.
- [Repo](https://github.com/zoom/arlo).

### Google Agent Assist: proactive generative knowledge assist (contact centre)

- **Help during the call:** proposes a search query from the conversation,
  runs it against the knowledge base, and shows a generated answer with
  sources to the human agent. It also returns extra queries that the agent can
  run by hand.
- **Speak or stay quiet:** an explicit event trigger,
  `suggestion_trigger_event`: `CUSTOMER_MESSAGE` (the default),
  `AGENT_MESSAGE`, or `END_OF_UTTERANCE`. Answers can also load
  asynchronously, so that only the query suggestion appears first.
- **Transcript consumption:** event-driven, per utterance. Google does not
  document how much history goes into query generation.
- **Context:** the knowledge bases configured in the conversation profile.
- **Display:** the agent desktop UI modules.
- **Latency, cost, quality:** no figures on the docs page. Generally
  available since 2024-06-14.
- Sources: [PGKA docs](https://docs.cloud.google.com/agent-assist/docs/pgka),
  [concepts](https://docs.cloud.google.com/agent-assist/docs/concepts).

### Dialpad Real-Time Assist / AI Live Coach cards (sales and support)

- **Help during the call:** pre-written cards (talk tracks, key facts) pop up
  on the rep's screen.
- **Speak or stay quiet:** user-defined trigger words. A card fires only the
  **first** time its word is said on a call. No LLM is involved in the
  trigger.
- **Transcript consumption:** keyword spotting on the stream.
- Sources: [Dialpad](https://www.dialpad.com/features/ai-live-coach-cards/),
  [ServiceTitan help on creating RTA cards](https://help.servicetitan.com/docs/create-real-time-assist-cards).

### Gong

- Its keyword trackers serve post-call analysis and search. No live in-call
  prompts were found. Gong's live capability, if any, is not documented in
  reachable sources.
- Source: [Gong keyword tracker FAQ](https://help.gong.io/docs/keyword-tracker-faqs).

### Twilio and AssemblyAI agent-assist guidance (architecture write-ups)

- Twilio's "Next Best Response" targets under 3 s latency on the live
  transcript, shown in a Flex plugin.
- AssemblyAI's implementation guide and practitioner write-ups give this
  latency budget: streaming ASR about 200–500 ms, retrieval about
  300–800 ms, render under 200 ms, and a whole pipeline under 1–2 s. The
  stated key design point is to decouple the media stream from asynchronous
  retrieval loops.
- Sources: [Twilio](https://www.twilio.com/en-us/blog/insights/agent-assist),
  [AssemblyAI guide](https://www.assemblyai.com/blog/how-does-real-time-agent-assist-work-an-implementation-guide).

### "Beyond-RAG" paper (measured)

- A real-time question identification and answer generation system for
  contact centres. A manual trigger (the agent presses a button) measured
  **5.5+ s latency** and higher cost, which the authors judge unsuitable.
  Their design instead runs matching and generation automatically over a
  **rolling window of the last 5 conversation turns**, with two parallel
  Claude 3 Haiku threads. This is the only source found that compares trigger
  strategies with measurements.
- Source: [arXiv 2410.10136](https://arxiv.org/pdf/2410.10136).

## Transcript-consumption strategies found

| Strategy | Who | Cost per step on a long call | Strengths | Weaknesses |
|---|---|---|---|---|
| Reread the whole transcript on demand | Teams Copilot (apparently; not documented) | Grows with the call | Simple. Nothing lost. | Slow and costly late in an hour-long call. Not suited to proactive hints. |
| Fixed recent window, no memory | Natively prompts (120–180 s), Beyond-RAG (5 turns), meeting-helper (N buffers) | Constant | Cheap and fresh. Fits answering the current question. | Forgets earlier parts. Natively added recaps for exactly this reason. |
| Recent window + incremental summary of only new text, carrying the previous summary forward | MeetingBro `rolling_summary` and `meeting_memory` | Constant | Does not repeat work. Memory stays small. | Summary drift accumulates. The previous summary may lose details. |
| Compressed memory + raw recent tail | MeetingBro `cumulative_meeting_summary` | Constant | Keeps exact recent wording beside long-term state. | Two artefacts to keep in sync. |
| Block recaps (summarise every N lines once, keep all recaps) | Natively (400 lines per block, up to 60) | Constant per block; recap set grows slowly | Nothing evicted. Summary work stays off the answer path. | Coarse blocks lag behind the live call. |
| Event or keyword trigger per utterance | Google PGKA (end of utterance, customer or agent message), Dialpad (first mention of a keyword) | Per event | Low latency. Quiet by default. Cheap (Dialpad uses no LLM). | Needs a good query from a short context. Keywords are brittle. |
| RAG over past meetings and files | Natively (SQLite vectors), meeting-helper (post-call), Fireflies (knowledge base) | Per query | Brings in context beyond the call. | Needs an index. Vector search in all cases found. |

## Owner's hypotheses against the evidence

1. **Rolling summaries instead of rereading.** Supported. MeetingBro
   implements almost the proposed scheme: a 180 s window refreshed every
   60 s, a compressed memory every 120 s, and a 120 s raw tail beside it. Its
   code says outright that sending the full transcript every time is what it
   avoids. Natively reached the same conclusion through recaps. **One
   difference:** MeetingBro deliberately feeds *only new* segments to the
   rolling summary and carries the previous summary forward, rather than
   overlapping windows, because overlap made the LLM repeat itself. Overlap
   happens in the prompt (previous summary plus new text), not in the raw
   windows. None of the products found has published measurements of window
   or overlap sizes, so the experiment the owner proposes is still open.
2. **This matters for long calls, not for short ones.** Consistent, but
   untested. Natively says its retrieval-window approach covered only "a few
   minutes of a long meeting", and MeetingBro's comment names long meetings.
   Neither gives a threshold. No product measured the 15 vs 60 minute
   difference.
3. **A plain Markdown index of folders, no vector search.** Not found in any
   product. Every product that brings local or knowledge context uses either
   a hosted knowledge base (Fireflies, Google) or local vector search
   (Natively). The nearest equivalent is Natively's 8,000-character pasted
   notes, which are injected whole into every prompt. That is a hand-made
   index with no retrieval. Nothing here shows the Markdown index is wrong;
   it is simply untried in this field.

Two further points the products show and the hypotheses do not cover:

- **When to speak is a separate design axis** from how to read the
  transcript. The options found are on request (Teams), a per-utterance event
  (Google), first keyword mention (Dialpad), an LLM judge per utterance
  (Natively Auto Answer), and a fixed timer (MeetingBro). Only Beyond-RAG
  measured anything: manual triggering was too slow.
- **Keep the answer path separate from background summarising.** Natively
  runs recaps only after any in-flight answer. MeetingBro skips background
  summaries under load. Contact-centre guidance says the same: decouple the
  stream from retrieval.

## Not found

- Any internals for Cluely, Fireflies, Otter or Teams Copilot: how much
  transcript they send, whether they summarise, or their latency.
- Gong live-call features.
- Glass source: the repository returned 404 on 2026-11-24.
- Any published measurement of summary window or overlap sizes, or of cost
  or quality for long calls, from any product.
- Any product using a non-vector, Markdown-style index of local folders or
  repositories.
