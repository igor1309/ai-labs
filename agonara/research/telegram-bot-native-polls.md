---
date: 2026-06-20
model: claude
description: "Grounded research verifying a Telegram agent's (Hermes) claim that it cannot create native Telegram polls. Confirms sendPoll is a real, separate Bot API method bots can call, that the gap is tooling not platform, and the key caveat that bots cannot send polls in private 1-on-1 chats."
---

# Telegram Bot Native Polls — Verifying the Hermes "no poll tool" Claim

> **Grounded research note.** Produced by the `researcher` subagent against the
> official Telegram Bot API docs and corroborating sources. Every claim is
> sourced; verified-vs-inferred is separated; confidence and gaps are stated.
>
> Relevant to the Telegram-bot runtime called out in
> [`../backlog/agent-connectivity.md`](../backlog/agent-connectivity.md): it
> documents what a Telegram bot's tool surface can and cannot do (native
> `sendPoll` vs. `sendMessage`, and the private-chat poll restriction) — a
> capability/affordance reference for agents people reach Agonara with, not an
> Agonara artifact itself.

## Question

A Telegram-connected AI agent ("Hermes") told a user it cannot create a native
Telegram poll. Its claim (translated from Russian):

> "Right now in this chat I don't have access to all of Telegram's capabilities
> directly, only those granted via tools. Here I have `send_message` available,
> but there is no separate tool for a native Telegram poll. So: Telegram as a
> platform supports polls; my current tool access does not, it can't create them;
> therefore I can only send text with numbered options, and you reply with a
> number."

Three sub-questions:

1. Does the Telegram Bot API support creating native polls programmatically (by a bot, not just a human user)?
2. Is a native poll a separate API method from sending a text message?
3. Is the agent's overall claim accurate — is this a tooling/permission limitation of its own setup rather than a Telegram platform limitation? Any caveats?

## Verdict

Hermes's core claim is **substantially accurate but incomplete**.

Correct: Telegram bots *can* create native polls; `sendPoll` is a separate method
from `sendMessage`; the agent's inability is a tooling-wiring gap (only
`send_message` was exposed), not a platform limitation; the numbered-text
fallback was the right workaround given that gap.

Missing caveat: **bots cannot send polls in standard private 1-on-1 chats** — the
API returns `Bad Request: polls can't be sent to private chats`. If Hermes
operates in a private chat (which appears to be the case), adding a `sendPoll`
tool would still fail there. Native polls work in groups, supergroups, and
channels.

## Findings

### 1 — `sendPoll` exists; bots can create polls (VERIFIED)

The Telegram Bot API has a dedicated method `sendPoll`. Introduced in Bot API 4.2
(April 14, 2019): "Added support for native polls: added the object `Poll`, the
methods `sendPoll` and `stopPoll` and the field `poll` in the `Update` object."
Current API at time of access: Bot API 10.1 (June 11, 2026). Required params:
`chat_id`, `question`, `options`.

### 2 — `sendMessage` cannot create a poll; `sendPoll` is the only path (VERIFIED)

`sendMessage` and `sendPoll` are distinct methods with separate endpoints.
`sendMessage` has no poll-type parameter. A native poll is its own message type
(the `Poll` object: `question`, `options[]`, `type`, `is_anonymous`, …).

### 3 — Hermes's "only the tools I was given" framing is accurate (VERIFIED structurally / INFERENCE about Hermes internals)

Bots have had `sendPoll` since April 2019. Hermes states it only has
`send_message`. Therefore the gap is tool configuration, not platform capability.
(Inference, since the researcher had no access to Hermes's actual tool manifest.)

### 4 — Caveat: bots cannot send polls in private 1-on-1 chats (MEDIUM confidence)

Attempting `sendPoll` against a private chat returns
`Bad Request: polls can't be sent to private chats`. Exception: private chats with
forum topics enabled (`message_thread_id`) — a niche config, not a standard 1-on-1
bot conversation. Consistent with the MTProto API describing polls as a "chats and
channels" feature. The rendered Bot API `sendPoll` page did not spell out this
exclusion; behavior confirmed via developer community sources and the exact error
string. A single test call against a private `chat_id` would settle it
definitively.

### 5 — Poll types and anonymity (VERIFIED)

`sendPoll` supports `type="regular"` (standard vote) and `type="quiz"` (correct
answers + explanation). `is_anonymous` controls whether votes are public.

## What it would take to enable native polls

Wire a `send_poll` tool that calls `POST /bot<token>/sendPoll` with `chat_id`,
`question`, `options` (optionally `type`, `is_anonymous`). Stable, 7+-year-old
method. **But** it only works in groups/supergroups/channels — for a private 1-on-1
chat with the bot, Telegram blocks it, so the numbered-text fallback (or moving
the interaction into a group) remains the only option there.

## Confidence & gaps

- **High:** `sendPoll` exists and bots can call it; `sendMessage` cannot create polls; the missing-tool explanation is structurally correct; introduced Bot API 4.2 (2019-04-14).
- **Medium:** the private-chat restriction — reproducible, well-known behavior and exact error string, but not present in the rendered official Bot API page; a live API call would confirm.
- **Gap:** non-anonymous-poll constraints (group size, admin rights) not investigated — peripheral to the question.

## Sources

- [Telegram Bot API — sendPoll method](https://core.telegram.org/bots/api#sendpoll) — accessed 2026-06-20
- [Telegram Bot API — current documentation](https://core.telegram.org/bots/api) — accessed 2026-06-20
- [Telegram API — Poll object (MTProto)](https://core.telegram.org/api/poll) — accessed 2026-06-20
- [Bot API changelog](https://core.telegram.org/bots/api-changelog) — accessed 2026-06-20
- [Request support for Polls: New Telegram Bot API v4.2 — node-telegram-bot-api Issue #718](https://github.com/yagop/node-telegram-bot-api/issues/718) — accessed 2026-06-20
- [Native Polls — Telegram.Bot .NET library guide](https://telegrambots.github.io/book/2/send-msg/native-polls-msg.html) — accessed 2026-06-20
- [SendPoll javadoc — telegrambots-meta 4.4.0](https://javadoc.io/static/org.telegram/telegrambots-meta/4.4.0/org/telegram/telegrambots/meta/api/methods/polls/SendPoll.html) — accessed 2026-06-20
