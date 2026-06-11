---
date: 2026-06-11
model: claude
description: "Captured external reference: a Habr write-up of a Telegram deep-link one-time-token login flow, with an Agonara take. Kept as a pattern/anti-pattern reference for the bearer-token item in ../backlog/agent-connectivity.md."
---

> **Captured reference, not an Agonara artifact.** The source below is an
> external write-up (a weekend-built course platform on Habr) preserved
> verbatim because its Telegram auth flow is directly relevant to the
> bearer-token future work in
> [`../backlog/agent-connectivity.md`](../backlog/agent-connectivity.md).
> Nothing in the source describes Agonara itself.

## Agonara take

The article and the backlog item share the word "token" but solve different
problems — and the article is most interesting for what it gets away with that
Agonara explicitly can't.

**What each one is.** The article describes a *human login* flow: a one-time
token in a Telegram deep link binds a chat to a user, the frontend polls until
the bot confirms, then the site drops an `aa_uid` cookie and a localStorage
entry. The Agonara future work
([`../backlog/agent-connectivity.md`](../backlog/agent-connectivity.md), token
section) is *agent* authentication: a personal-access-token / bearer scheme so
non-browser clients can call the API without driving the password → session
cookie → CSRF dance. Different client kind, different threat model.

**Where the article validates the backlog.**

1. The backlog's framing — Telegram bots, Claude Code, other HTTP agents as
   the clients that find cookie+CSRF awkward — is exactly what the article
   author hit. He didn't reject the Telegram Login Widget for security
   reasons; he rejected it because the HTTPS-callback-plus-backend-verification
   flow didn't fit his runtime. Same friction the bearer-token item exists to
   remove, so its prioritization ("the biggest single enabler") looks right.
2. The deep-link + one-time token + polling handshake itself is a legitimate
   pattern — essentially a homemade OAuth device-code flow. If Agonara ever
   wants Telegram as a *user* login path, this is the cheap, workable shape,
   and it slots cleanly into the existing model: Telegram identity becomes
   just another credential binding to an internal `Identity`, which
   [ADR-008](../docs/adr/adr-008-first-slice-authentication-session-and-credential-boundary.md)
   explicitly leaves room for ("additional credential providers" via later
   ADR).

**Where the article is a cautionary tale, not a template.** The flow's
endpoint is the problem: after the handshake, the durable credential is an
`aa_uid` cookie — apparently a bare user id used for server-side payment
checks. That is a forgeable, non-expiring, non-revocable bearer credential;
anyone who learns or guesses a uid is that user. The author is honest that
this is fine for a free-content platform, and at his stakes it probably is.
The Agonara backlog already names exactly the corner he cut as the real cost
of the feature: token lifecycle — issue, scope, expire, revoke, store hashed.
The article is a live demonstration of why that paragraph is the load-bearing
part of the backlog item, not ceremony. ADR-008's invariants (opaque,
server-managed, revocable; client-held data never the authority source) would
forbid the `aa_uid` shortcut outright.

**One smaller observation.** The handshake's *initial* token is done right —
one-time, short-lived, exchanged for the durable credential — mirroring how
Agonara's bootstrap secret works (single-use, never becomes a session). The
article's design is sound up to the exchange and weak after it; the planned
Agonara design is the inverse emphasis, putting all the rigor into what the
durable token is.

**Bottom line:** nothing here changes the backlog's direction or priority. It
independently confirms the bearer-token item is the right enabler for
Telegram-shaped clients, and it is a candidate citation for the eventual
ADR-008 follow-up spec — both as the pattern to borrow (device-code-style
handshake) and the anti-pattern to name (raw-id bearer cookie).

## Source (verbatim)

---
date: 2026-06-11
title: Перевёл 16 курсов Anthropic Academy на русский и собрал платформу за выходные / Хабр
source: https://habr.com/ru/articles/1034458/
---

Авторизация через Telegram

Стандартный Telegram Login Widget не подходил: требует HTTPS callback и верификацию на бэкенде. На shared-хостинге неудобно. Сделал проще:

Пользователь нажимает “Войти через Telegram” на сайте

Открывается бот @StadikaCoursesBot с deep link, содержащим одноразовый токен

Бот получает /start с токеном, сохраняет связку token-user

Фронтенд поллит API каждые 2 секунды: “пришёл ли пользователь с таким токеном?”

Когда бот подтверждает, фронтенд сохраняет данные в localStorage + cookie

Без OAuth, без JWT. Для учебной платформы это избыточно. Cookie aa_uid нужен для серверной проверки оплаты, localStorage для фронтенда. Пользователь тратит 5 секунд.

Зачем авторизация, если контент бесплатный? Контакт пользователя для коммуникации и привязка оплаты к аккаунту.
