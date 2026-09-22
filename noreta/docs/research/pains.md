---
date: 2026-09-15
author: Igor Malyarov
model: got-5.6-sol
---

Да. Я посмотрел не только README, но и changelog/issues — там как раз видны архитектурные последствия решений. Для Вашей идеи наиболее полезны не прямые конкуренты, а несколько разных классов продуктов.

## Что я бы изучал

| Продукт | Подход | Что особенно полезно нам |
|---|---|---|
| [oai_citation:0‡github.com](https://github.com/cordwainersmith/Claudoscope?utm_source=chatgpt.com) | passive local indexer | discovery, incremental indexing, history |
| [oai_citation:1‡github.com](https://github.com/jhlee0409/claude-code-history-viewer?utm_source=chatgpt.com) | multi-provider history index | масштабирование большой истории |
| [oai_citation:2‡github.com](https://github.com/asheshgoplani/agent-deck?utm_source=chatgpt.com) | runtime/session manager поверх tmux | active state, lifecycle, orchestration — и масса полезных граблей |
| [oai_citation:3‡github.com](https://github.com/stravu/crystal?utm_source=chatgpt.com) | session ↔ worktree workflow | workspace identity и lifecycle |
| [oai_citation:4‡github.com](https://github.com/lezi-fun/codex-webui?utm_source=chatgpt.com) | semantic UI поверх `codex app-server` | как управлять runtime без терминального UX |
| [oai_citation:5‡github.com](https://github.com/slopus/happy?utm_source=chatgpt.com) | wrapper + remote control | что ломается, когда продукт начинает владеть runtime |

## 1. Claudoscope — наиболее близок к первой версии

Он читает существующие `~/.claude/projects`, слушает **FSEvents**, инкрементально парсит изменившиеся JSONL и держит производный SQLite index. На ~3000 session files стартует из SQLite, затем reconciles изменившиеся файлы. Полностью разобранные сессии дополнительно держит в LRU. [oai_citation:6‡GitHub](https://github.com/cordwainersmith/claudoscope?utm_source=chatgpt.com)

Это почти ровно архитектура, к которой мы пришли.

Но особенно интересны проблемы, которые появились:

- FSEvents может overflow/drop events → пришлось добавлять full rescan recovery.
- Concurrent delta parsing дал crash → понадобилась синхронизация.
- Большие live sessions дали 100% CPU из-за повторного markdown parsing → memoization/LRU.
- UI-state одной session протекал в другую.
- resumed/forked/subagent transcripts создавали **двойной учёт** usage и неправильную временную атрибуцию. [oai_citation:7‡GitHub](https://github.com/cordwainersmith/Claudoscope/releases?utm_source=chatgpt.com)

**Вывод:** `filesystem = source of truth`, SQLite = disposable derived index — очень хорошее решение. Но parser должен сразу проектироваться как incremental + idempotent + rebuildable.

И ещё важный урок: Claudoscope считает session «active», если файл менялся последние 60 секунд. [oai_citation:8‡GitHub](https://github.com/cordwainersmith/claudoscope?utm_source=chatgpt.com) Это нормально для observability dashboard, но **для нашего определения active недостаточно**. Мы уже пришли к более сильной семантике: существует адресуемый runtime.

---

## 2. History Viewer — отличный источник граблей вокруг глубины истории

Он уже поддерживает 29 providers и автоматически сканирует локальные session stores. [oai_citation:9‡GitHub](https://github.com/jhlee0409/claude-code-history-viewer?utm_source=chatgpt.com)

И они буквально упёрлись в вопрос, который Вы подняли про старые sessions.

При больших corpus пришлось сделать:

- pagination списка sessions;
- открывать только ~200 последних сообщений;
- lazy-load более старых;
- cached analytics;
- per-file cache invalidation через `size + mtime`;
- parallel workspace scans;
- отдельный `Load all`, причём UI явно предупреждает, что на диске есть ещё sessions. 47k-message session до этого могла подвешивать приложение. [oai_citation:10‡GitHub](https://github.com/jhlee0409/claude-code-history-viewer/blob/main/CHANGELOG.md?utm_source=chatgpt.com)

**Вывод:** я бы изменил наше предыдущее решение совсем немного:

**metadata всех обнаруженных sessions индексировать всегда; transcript — demand-driven.**

Тогда «ещё 287 sessions старше месяца» — чисто presentation policy. Search при необходимости может постепенно расширять индекс.

---

## 3. Agent Deck — пожалуй, самый ценный антиучебник

Он решает более амбициозную задачу: сам управляет sessions через tmux, определяет `running/waiting/idle`, отправляет input, создаёт worktrees и т. д. [oai_citation:11‡GitHub](https://github.com/rkunnamp/agent-deck?utm_source=chatgpt.com)

И issues очень показательные.

### Status оказывается сложной распределённой сущностью

CLI видел `waiting`, Web UI показывал `error`, потому что разные части продукта по-разному вычисляли runtime-derived state. [oai_citation:12‡GitHub](https://github.com/asheshgoplani/agent-deck/issues/963?utm_source=chatgpt.com)

В другом случае живой Claude продолжал работать, но registry потерял его `session_id` и объявил session `error`. [oai_citation:13‡GitHub](https://github.com/asheshgoplani/agent-deck/issues/911?utm_source=chatgpt.com)

Для OpenCode status вообще определялся **по тексту terminal pane**: поиск spinner/prompt strings. Потом появилась задача заменить это SSE events. [oai_citation:14‡GitHub](https://github.com/asheshgoplani/agent-deck/issues/1614?utm_source=chatgpt.com)

Это сильный аргумент за:

> provider-specific runtime adapter должен сообщать наблюдаемые факты; единая state machine уже интерпретирует их.

А не `isActive()` с кучей эвристик.

### Управление через терминал создаёт race conditions

Agent Deck отправлял prompt через tmux; иногда текст попадал в input buffer, а Enter — нет. UI показывал `waiting`, хотя агент фактически даже не получил запрос. [oai_citation:15‡GitHub](https://github.com/asheshgoplani/agent-deck/issues/616?utm_source=chatgpt.com)

Ещё хуже: `send --wait` мог вернуть **старый response**, потому что session уже находилась в состоянии waiting. [oai_citation:16‡GitHub](https://github.com/asheshgoplani/agent-deck/issues/380?utm_source=chatgpt.com)

Это ровно причина, почему Ваше замечание «терминал на iPhone — плохой UX» глубже, чем UX:

**PTY плох ещё и как semantic control protocol.**

### Владение runtime тащит lifecycle-проблемы

Dead tmux sessions остаются сиротами; custom sockets ломали liveness detection; один wedged tmux server запускал reconnect storm; отдельно возник вопрос изоляции socket'ов, потому что падение одного tmux server могло снести десятки sessions. [oai_citation:17‡GitHub](https://github.com/asheshgoplani/agent-deck/issues/755?utm_source=chatgpt.com)

Для нашего MVP это хороший сигнал:

**не владеть runtime вообще. Discover → observe → open.**

Control добавить позже там, где provider предоставляет нормальный protocol.

---

## 4. Crystal/Nimbalyst — цена модели «session = worktree»

Crystal пошёл гораздо дальше: каждая новая задача создаёт isolated Git worktree, агент работает там, приложение ведёт commits/diff/merge/archive. Позже они разрешили несколько agents в одном worktree. [oai_citation:18‡GitHub](https://github.com/stravu/crystal?utm_source=chatgpt.com)

Это даёт великолепный workflow, но приложение начинает владеть:

`session → worktree → branch → commits → merge → archive → delete`

И changelog показывает последствия: worktree deletion failures, sessions stuck initializing, state bugs run scripts, race-condition hardening против cross-session leaks. Issues содержат и `autocontext bleeding into agent's main workspace`. [oai_citation:19‡GitHub](https://github.com/stravu/crystal/issues?utm_source=chatgpt.com)

**Для нас важный продуктовый вывод:** workspace/worktree действительно хорошая **facet**, но плохой кандидат на обязательную parent entity.

То, что мы решили — session как самостоятельный объект + обнаруженный workspace/repo/worktree context — выглядит существенно устойчивее.

---

## 5. Codex WebUI — хороший образец второй фазы

Здесь архитектура принципиально другая:

`Browser ↔ WebSocket JSON-RPC ↔ local server ↔ stdio JSON-RPC ↔ codex app-server`

Поэтому UI получает настоящие threads, streaming turns, tool states, approvals, diffs, models — семантические данные вместо терминального output. [oai_citation:20‡GitHub](https://github.com/lezi-fun/codex-webui?utm_source=chatgpt.com)

Это именно направление для будущего relay.

Но появляется новая боль: локальный WebUI фактически получает возможность **исполнять команды и менять файлы**. Поэтому проект уже имеет authentication, allowlisted RPC, path canonicalization, symlink restrictions, signed cookies, ограничения patch API и отдельно предупреждает не выставлять сервер напрямую в интернет. [oai_citation:21‡GitHub](https://github.com/lezi-fun/codex-webui/blob/main/SECURITY.md?utm_source=chatgpt.com)

Отсюда для нас полезная граница:

**Indexer API и Control API должны концептуально быть разными trust domains**, даже если первоначально живут в одном процессе.

---

## 6. Happy — цена wrapper-модели

Happy решает remote control универсально через собственный wrapper:

`happy claude` / `happy codex`

вместо обычного запуска агента. Есть web/mobile, E2EE, notifications, remote input. [oai_citation:22‡GitHub](https://github.com/slopus/happy?utm_source=chatgpt.com)

Это позволяет получить гораздо больше контроля, но wrapper становится частью lifecycle. Например, был баг, где переключение remote → local создавало **новую Claude session вместо resume существующей**, и conversation исчезал из mobile view. Другие reports — reconnect failures, permission timeout disconnect и long-running sessions перестают синхронизироваться. [oai_citation:23‡GitHub](https://github.com/slopus/happy/issues/1208?utm_source=chatgpt.com)

Для Вашего продукта это, пожалуй, главный architectural warning:

> **Не требовать специального способа запуска агента ради dashboard.**

Иначе launcher постепенно превращается в runtime supervisor, а надёжность Claude/Codex становится Вашей ответственностью.

---

# Что из исследования уже выглядит как хороший product thesis

Я бы пока зафиксировал границу **v1** очень жёстко:

**Local session index + launcher для существующих coding agents.**

Он:

- автоматически обнаруживает sessions Claude/Codex;
- различает **runtime facts** и historical activity;
- индексирует metadata всей истории, transcript — постепенно/on demand;
- сохраняет historical workspace/worktree context;
- даёт facets/grouping/search вместо навязанной hierarchy;
- realtime обновляется через filesystem/provider events;
- открывает native session через deeplink;
- **не запускает, не рестартует и не владеет агентами.**

Это уже занимает довольно чистую нишу между Claudoscope/History Viewer («посмотреть историю») и Agent Deck/Crystal («я управляю Вашими runtime/worktrees»).

А **v2 relay** логично строить только через semantic adapters: Codex `app-server`, соответствующий structured interface Claude, когда он пригоден, и лишь fallback-механизм для providers без protocol.

Самый сильный вывод из чужих проблем: **сложность резко возрастает в момент, когда dashboard начинает считать себя владельцем session lifecycle.** До этой границы продукт может оставаться маленьким, быстрым и довольно надёжным.

---

Да. Я бы сформулировал наблюдение чуть точнее: **проблема начинается, когда новая capability добавляется внутрь существующей ответственности вместо появления новой границы**.

На нашем примере эволюция легко выглядит так:

`indexer → indexer + runtime detection → + lifecycle → + control → + relay → + auth/security`

Каждый шаг локально кажется небольшим. Но постепенно компонент начинает одновременно **наблюдать, интерпретировать, управлять и транспортировать** состояние. Его интерфейс расширяется, остальные компоненты начинают зависеть от его внутренних представлений, и изменение одной capability требует изменений по всей системе. Это классическая эрозия information hiding: хорошие границы как раз должны локализовать изменение. [oai_citation:0‡GitHub](https://github.com/Synchronium/software-architecture-wiki/blob/main/wiki/concepts/modularity.md?utm_source=chatgpt.com)

Для нашего проекта я бы поэтому держал в голове не список модулей, а **независимые оси ответственности**:

`Discovery` — что существует  
`Index` — что мы знаем исторически  
`Runtime observation` — что происходит сейчас  
`Presentation` — как это показать  
`Control` — как воздействовать на runtime  
`Transport` — как доставить control удалённо

И важный критерий появления новой границы: **capability имеет собственный lifecycle, state или failure modes**. Тогда это уже хороший кандидат на отдельный компонент, даже если сегодня реализация занимает 200 строк.

Это, кстати, хорошо объясняет увиденное в Agent Deck: tmux начинался как механизм запуска, а затем стал одновременно identity, liveness detector, transport и control channel. После этого tmux-specific failures начали распространяться на понятие «session» целиком.