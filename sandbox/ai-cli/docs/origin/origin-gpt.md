---
date: 2025-08-30
description: "What this wrapper is (and isn’t)"
---

<me>
It’s my understanding that LLM from Google/OpenAI/Antropic have APIs with a lots of features, but using them from terminal is far from comfortable. I guess a possible way could be to write a script that
- uses system prompt from particular place (similar to gitignore it could try local folder first with fallback to global)
- takes input as a user prompt
- scans particular folders for rules or protocols refining system prompt
- gets and uses API keys
- composes and makes API request
- presents output
Does this make sense? Do multiple products made by developers (from solo to companies) do something like this?
I want to just discuss this.
No code until I say so.

<ai>
Short answer: yes—your plan makes a ton of sense, and lots of folks (from solo devs to teams) already do variants of it. The big players’ APIs all support the ingredients you’re describing (clear system instructions, tool/function calling, structured outputs, streaming), so a thin “terminal wrapper” with git-style config precedence is a very reasonable pattern. OpenAI’s current “Responses API” plus built-in tools; Anthropic’s Messages API with top-level `system` and tool use; and Google’s Gemini API with `system instructions` and function calling make this straightforward.  [oai_citation:0‡OpenAI Platform](https://platform.openai.com/docs/guides/tools?api-mode=responses&utm_source=chatgpt.com) [oai_citation:1‡Anthropic](https://docs.anthropic.com/en/api/messages?utm_source=chatgpt.com) [oai_citation:2‡Google AI for Developers](https://ai.google.dev/gemini-api/docs/function-calling?utm_source=chatgpt.com)

Here’s how people usually shape this:

1) System prompt sourcing (git-style precedence)  
- Project prompt first (e.g., `.promptrc` in repo), then user-global (e.g., `~/.promptrc`), then env overrides.  
- This matches how a bunch of tools handle layered config (project vs global). Continue.dev, for example, supports project/global configs for assistants and rules; prompt test tooling like Promptfoo relies on a project file too.  [oai_citation:3‡Continue](https://docs.continue.dev/yaml-reference?utm_source=chatgpt.com) [oai_citation:4‡Promptfoo](https://www.promptfoo.dev/docs/getting-started/?utm_source=chatgpt.com)

2) “Rules / protocols” folder that refines the system prompt  
- Common in practice: people keep reusable rules in files and concatenate them. Just keep an allowlist of paths/globs and a simple schema (e.g., frontmatter with `type: rule`) to avoid accidentally slurping untrusted text.  
- Watch token budget. Anthropic’s prompt caching exists largely to make big, mostly-static instructions affordable; it’s designed for exactly this “big system preamble + small user input” pattern.  [oai_citation:5‡Anthropic](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching?utm_source=chatgpt.com) [oai_citation:6‡Anthropic](https://www.anthropic.com/news/prompt-caching?utm_source=chatgpt.com)

3) Keys and auth  
- The de facto pattern is env vars: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` (or `GOOGLE_API_KEY`)—then optionally fall back to an OS keychain/1Password. The official docs mention these names directly.  [oai_citation:7‡OpenAI Platform](https://platform.openai.com/docs/guides/agents-sdk?utm_source=chatgpt.com) [oai_citation:8‡Anthropic](https://docs.anthropic.com/en/docs/get-started?utm_source=chatgpt.com) [oai_citation:9‡Google AI for Developers](https://ai.google.dev/gemini-api/docs/migrate?utm_source=chatgpt.com)

4) Compose the request  
- OpenAI: Responses API gives tool calling, web search/file search as *hosted* tools, and structured outputs (JSON schema). Anthropic: top-level `system` (no “system role” message), tool use with choices, plus prompt caching knobs. Google: `system instructions`, JSON mode, and function calling across SDKs. These cover ~all the UX you’d want from a terminal wrapper.  [oai_citation:10‡OpenAI Platform](https://platform.openai.com/docs/guides/tools?api-mode=responses&utm_source=chatgpt.com) [oai_citation:11‡OpenAI](https://openai.com/index/introducing-structured-outputs-in-the-api/?utm_source=chatgpt.com) [oai_citation:12‡Anthropic](https://docs.anthropic.com/en/api/messages?utm_source=chatgpt.com) [oai_citation:13‡Google AI for Developers](https://ai.google.dev/gemini-api/docs/text-generation?utm_source=chatgpt.com)

5) Present the output  
- Most wrappers stream to stdout by default; for “structured” tasks it’s common to gate the model into strict JSON (schema/“structured outputs”) and pretty-print or write to a file. All three providers now have a first-party story for structured/JSON outputs.  [oai_citation:14‡OpenAI Platform](https://platform.openai.com/docs/guides/structured-outputs?utm_source=chatgpt.com) [oai_citation:15‡Google AI for Developers](https://ai.google.dev/api/generate-content?utm_source=chatgpt.com)

What already exists (so you don’t reinvent more than you want):
- #llm (Simon Willison) — a popular cross-provider CLI with model plugins, prompt presets, logging, and (newer) tool/run support. Great for “just use the API from a terminal” with light configuration.  [oai_citation:16‡GitHub](https://github.com/simonw/llm?utm_source=chatgpt.com) [oai_citation:17‡Simon Willison’s Weblog](https://simonwillison.net/2025/May/27/llm-tools/?utm_source=chatgpt.com)  
- aider — a CLI dev assistant that layers project/global config and keys via env, `.env`, or a config file; it’s focused on codebases but shows the same ergonomics you’re proposing.  [oai_citation:18‡aider.chat](https://aider.chat/docs/config/api-keys.html?utm_source=chatgpt.com)  
- LiteLLM Proxy / OpenRouter — gateways that normalize many providers behind one OpenAI-compatible endpoint; you keep your CLI tiny and let the gateway handle routing, fallbacks, cost controls.  [oai_citation:19‡LiteLLM](https://docs.litellm.ai/docs/providers/litellm_proxy?utm_source=chatgpt.com) [oai_citation:20‡OpenRouter](https://openrouter.ai/docs/quickstart?utm_source=chatgpt.com)  
- OpenAI’s own stack — if you want a more agentic direction later, the Agents SDK + Responses API is meant for “do tool things with simple code,” which a CLI can wrap cleanly.  [oai_citation:21‡OpenAI Platform](https://platform.openai.com/docs/guides/agents-sdk?utm_source=chatgpt.com)

Gotchas to keep in mind:
- **Provider differences:** Anthropic uses a top-level `system` field (not a message role). Google calls them “system instructions.” Your wrapper should normalize this so you don’t have to remember per-provider quirks.  [oai_citation:22‡Anthropic](https://docs.anthropic.com/en/api/messages?utm_source=chatgpt.com) [oai_citation:23‡Google AI for Developers](https://ai.google.dev/gemini-api/docs/text-generation?utm_source=chatgpt.com)  
- **Long prompts + cost/latency:** if you concatenate many rule files, enable prompt caching (Anthropic) and consider a compiled, hashed “bundle” that you reuse across calls.  [oai_citation:24‡Anthropic](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching?utm_source=chatgpt.com)  
- **Tool/Function calling drift:** APIs differ a bit in parameters and streaming. Your adapter layer should map a single “tool” concept to OpenAI’s tools, Anthropic’s tool use, and Gemini’s function calling.  [oai_citation:25‡OpenAI Platform](https://platform.openai.com/docs/guides/tools?api-mode=responses&utm_source=chatgpt.com) [oai_citation:26‡Anthropic](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview?utm_source=chatgpt.com) [oai_citation:27‡Google AI for Developers](https://ai.google.dev/gemini-api/docs/function-calling?utm_source=chatgpt.com)  
- **Structured outputs:** schema enforcement and failure modes vary—OpenAI’s “structured outputs” is strict; others have “JSON mode.” Your CLI should handle retries/repair on invalid JSON.  [oai_citation:28‡OpenAI Platform](https://platform.openai.com/docs/guides/structured-outputs?utm_source=chatgpt.com) [oai_citation:29‡Google AI for Developers](https://ai.google.dev/api/generate-content?utm_source=chatgpt.com)  
- **Search / web access:** If you want optional web search without adding your own crawler, OpenAI’s built-in web search tool exists in the Responses API; for Anthropic/Gemini you’d bring your own tool or gateway.  [oai_citation:30‡OpenAI Platform](https://platform.openai.com/docs/guides/tools-web-search?api-mode=responses&utm_source=chatgpt.com)

When teams “go bigger” than a script:
- They stick a **gateway** in the middle (LiteLLM or OpenRouter) for key management, quotas, model routing, per-org policy, then put a very slim CLI on top. It keeps your terminal UX stable even if you swap providers/models later.  [oai_citation:31‡LiteLLM](https://docs.litellm.ai/docs/providers/litellm_proxy?utm_source=chatgpt.com) [oai_citation:32‡OpenRouter](https://openrouter.ai/docs/quickstart?utm_source=chatgpt.com)

If we keep this as “just discuss,” I’d frame your wrapper like this:
- **Config & precedence:** project `.llmrc` → user `~/.llmrc` → env; “profiles” for quick switching (e.g., `default`, `redteam`, `spec-writer`). (This mirrors how other tools do it.)  [oai_citation:33‡Continue](https://docs.continue.dev/yaml-reference?utm_source=chatgpt.com)  
- **Prompt assembly:** base system prompt + ordered `rules/` directory (allowlist globs), with a “compiled bundle” cache. Add a `--dry-run` that prints the exact assembled prompt for transparency. (Use provider prompt caching where available.)  [oai_citation:34‡Anthropic](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching?utm_source=chatgpt.com)  
- **Request layer:** one internal schema (`model`, `temp`, `max_tokens`, `tooling`, `format`) mapped to provider specifics (OpenAI Responses, Anthropic Messages, Gemini generate).  [oai_citation:35‡OpenAI Platform](https://platform.openai.com/docs/guides/tools?api-mode=responses&utm_source=chatgpt.com) [oai_citation:36‡Anthropic](https://docs.anthropic.com/en/api/messages?utm_source=chatgpt.com) [oai_citation:37‡Google AI for Developers](https://ai.google.dev/api/generate-content?utm_source=chatgpt.com)  
- **Output modes:** stream to tty; `--json` for machine use; `--md out.md` for reports.  
- **Safety & trust:** avoid auto-including arbitrary files; keep an explicit `rules/` and `context/` list to reduce prompt-injection risk.

If you want, we can next sketch the exact behaviors (flags, precedence rules, file naming, error handling) and only then drop into code.

<me>
I’m thinking of kinda abstracted tool. Let me try to explain - this tool could be domain agnostic, kinda generic one, using domain knowledge from the context, kinda like this:

- say I’m developing a lore, or script
- in ‘.ai’ folder there could be system prompt with additional rules for scripting, character development, beet analysis, etc
  If I’m coding, I could use system prompt in ‘.ai’ folder as well as ‘.gemini’, ‘.claude’ rules.
  A system, a wrapper could use this to form system prompt and work with user input. The responsibility of this wrapper would be to compose API request.
  Just like git there could be a command that asks for a project domain (coding, scripting, etc) is and repopulate ‘.ai’ folder with relevant templates. Or that same wrapper been launched from folder that does not have ‘.ai’ could ask for domain and add it.

<ai>
Totally makes sense—and you can keep it simple without painting yourself into a corner. Here’s a crisp way to think about it.

# What this wrapper is (and isn’t)
- **Goal:** one tiny, domain-agnostic CLI that **assembles** context and **normalizes** requests to any provider.  
- **Non-goals:** fancy agents, RAG, or project scanning magic by default. (Opt-in later.)

# Minimum viable shape
**Four responsibilities, full stop:**
1) **Load config with git-style precedence**  
   `./.ai` (project) → nearest parent with `.ai` → `~/.ai` (global) → built-ins.
2) **Assemble the prompt bundle**  
   Base system → domain pack (coding/scripting/…​) → provider overlay → optional local rules.  
3) **Normalize & send**  
   One internal request schema → adapters for OpenAI/Anthropic/Gemini.  
4) **Present output**  
   Stream to TTY; `--json` and `--file out.md` as needed.

# Folder & file conventions
You can support what you described **and** keep it deterministic.

```
.ai/
  config.yml                 # minimal: domain: scripting|coding|research
  system.md                  # project system prompt (domain-agnostic)
  rules/                     # small, reusable add-ons (ordered by prefix)
    10-style.md
    20-character-arcs.md
    30-beat-analysis.md
  providers/
    openai/
      overlay.md             # provider quirks, tools hints, format prefs
    anthropic/
      overlay.md
    gemini/
      overlay.md
  context/                   # explicit include-only files (NOT automatic repo scan)
    glossary.md
    canon.md
  templates/                 # local, editable domain pack files after init
  .aiignore                  # globs to exclude if you later enable any scanning
```

**Notes**
- Your earlier idea of `.gemini`, `.claude` folders can be **aliases** to `providers/gemini`, `providers/anthropic` for familiarity.
- File types are just text (`.md`, `.txt`, `.yaml`). Add **front-matter** if you want (e.g., `priority`, `tags`), but you don’t need it day one.

# Deterministic assembly (so it’s debuggable)
1) **Start** with `system.md`.  
2) **Apply domain pack** (see “Domain packs” below).  
3) **Apply provider overlay** (only the chosen provider).  
4) **Append rules/** in lexical order.  
5) **Attach context/** by explicit allowlist from `config.yml` (no repo-wide slurping by default).  

Provide `ai explain` to print the assembled bundle with file origins + token counts. Trust through transparency.

# Domain packs (your “repopulate .ai” idea)
Treat domains as **template packs** you can copy in and then edit.

- `ai init` → asks for domain (coding/scripting/research/blank) and creates `.ai/` from built-in pack.
- `ai domain add scripting` → merges scripting pack into existing `.ai/` (no overwrites unless `--force`).
- `ai templates list` → shows available packs (local or remote catalog).
- **Packs are just folders** in a catalog you control (local path or a git URL). They ship with sensible defaults:
  - **coding/**: `rules/10-style.md`, `rules/20-refactor-guardrails.md`, provider overlays preferring JSON output.
  - **scripting/**: `rules/10-character.md`, `rules/20-beats.md`, `rules/30-outline.md`, overlays preferring markdown prose.
  - **research/**: `rules/10-citations.md`, `rules/20-fact-check.md`.

# Provider normalization (keep it tiny)
- One internal request object: `{model, temperature, max_output, system, messages, tools?, format?}`.
- Adapters translate to OpenAI/Anthropic/Gemini specifics (e.g., “system” field vs first message, JSON/structured-output knobs).
- **Keys**: use env first (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`), with optional `~/.ai/keys.env` or OS keychain.
- **Profiles** (optional, later): `ai --profile redteam` selects an alternate `~/.ai/profiles/redteam.yml` overlay.

# Commands (small, memorable)
- `ai init` – create `.ai/` interactively (choose domain).  
- `ai run "your prompt"` – run in the current folder, assemble, send, stream.  
  - Flags: `--provider openai`, `--model gpt-X`, `--json`, `--file out.md`.  
- `ai explain` – show the exact bundle (files + token sizes).  
- `ai domain add <name>` – add/refresh domain templates.  
- `ai doctor` – check keys, reachability, token estimates.  
- `ai cache clear` – nuke compiled bundles / fingerprints.

# Trust & safety (practical guardrails)
- **No automatic repo scan**. Only include `context/` and explicit globs from `config.yml`.  
- `context/` is your **allowlist**; `.aiignore` guards accidental pulls.  
- Redact secrets in logs; keep a `runs/` folder with request metadata (model, costs, sources) for reproducibility.  
- Optional: “strict JSON” mode for coding/research domains; retry on invalid JSON.

# Performance knobs (when you need them)
- **Bundle cache**: hash(assembled files) → reuse across runs.  
- Provider-specific features like prompt caching can be toggled in `providers/<name>/overlay.md` or `config.yml`.  
- `ai explain` shows the bundle hash so you can reason about cache hits.

# Why this works (and who else does parts of it)
- The “git-style precedence + project domain templates” pattern is already familiar to devs and used in many tools; you’re generalizing it for LLM work.  
- Lots of CLIs do slices of this (config layering, per-provider adapters, prompt files). Your twist is **one neutral `.ai/` contract** that’s domain-aware and provider-agnostic.

# What to decide next (no code, just choices)
1) **Domain pack list v1**: which three you want on day one (scripting, coding, research?).  
2) **Minimal `config.yml` schema**: `domain`, `provider_default`, `context_allowlist` (globs), optional `output: json|markdown`.  
3) **Merge strategy**: confirm order above; no “smart” auto-merge—deterministic append only.  
4) **Init UX**: interactive questions vs flags; do you want it to create a couple of example rule files per domain?  
5) **Logs & privacy**: where to store run transcripts by default (on/off, retention).

If you want, we can lock those four decisions in a one-page spec next.

<me>
What I feel is important -  is a separation of tool and knowledge: looking for API keys, selecting model and setting its parameters, assembling and performing requests is more or less clear kinda boring developer work.
Curating own knowledge base is different - here is where unique experience and expertise comes. As with git there could be a simple template pack with guides for growing it 1 if I decide to open source it.
In between there is a connection how to create manageable rules for assembling system prompt.

<ai>
You’re thinking about it the right way: treat **tooling** and **knowledge** as separate products, with a thin **assembly layer** between them. The tool should be boring, predictable plumbing; the knowledge should be curated and expressive; the assembly rules should be small, testable, and deterministic.

# 1) Clean separation of concerns

**Tool (plumbing)**
- Finds keys, selects model, sets params, sends/streams requests.
- Exposes a tiny, stable contract: `{provider, model, params, bundle}`.
- Never ships domain content. No opinions about “how to write.” No repo scans by default.

**Knowledge (your advantage)**
- Domain packs you own: scripting, coding, research, etc.
- Lives in human-readable files you can open-source or keep private.
- Evolves via docs, examples, and contribution guidelines (versioned like code).

**Assembly rules (the glue)**
- A small, explicit spec that turns “pack + project overrides” into one **system prompt bundle**.
- Deterministic (same inputs → same bundle hash).
- Auditable (“explain” prints exact pieces and their order).

# 2) Manageable rules for assembling the system prompt

Keep rules **simple and observable**. You don’t need a DSL; you need a few predictable operators and conventions.

**Rule operators (minimal set)**
- **include:** add a file’s content into the bundle.
- **order:** numeric prefix determines placement (e.g., `10-identity`, `20-principles`, `30-style`).
- **role/section:** where it goes in the final prompt (e.g., `prelude`, `guardrails`, `style`, `format`).
- **when:** simple gates by *domain*, *provider*, or *task tag* (e.g., include only for `domain=scripting` or `provider=openai`).
- **scope:** `system` vs `context` (context = non-instruction reference like canon/glossary).
- **max-size hint (optional):** lets the tool warn if a section is too long for the budget.

**Deterministic assembly order**
1) Project `system` base  
2) Domain pack sections (in numeric order)  
3) Provider overlay sections (only for the chosen provider)  
4) Project `rules/` (numeric order)  
5) Explicit `context/` attachments  
→ Produce a **bundle manifest** (file list + sizes + final hash)

**Rule naming conventions**
- Prefix numbers for order, nouns for intent:  
  `10-identity`, `20-domain-principles`, `30-guardrails`, `40-task-modes`, `50-style`, `60-output-format`, `90-safety-notes`.
- Keep each file short and single-purpose. If a rule grows, split it (e.g., `30-guardrails-input`, `31-guardrails-facts`).

**Gating without complexity**
- Tags live in a tiny header (a few key–value pairs like `domain: scripting`, `provider: openai|any`, `task: beat-sheet|code-review`).  
- Gates are **additive allowlists**, not boolean soup. If it doesn’t match, it’s skipped.

**Sections that age well**
- **Identity & scope** (what the assistant is *for this repo*).  
- **Domain principles** (e.g., beat logic for scripting; API-change discipline for coding).  
- **Guardrails** (trust, safety, do/don’t).  
- **Task modes** (named patterns you actually use: “beat analysis,” “character beat merge,” “diff review,” “RFC critique”).  
- **Style & output** (tone, headings, JSON/MD expectations).  
- **Self-check (optional)** (quick internal checklist at the end: “validate beats are chronological,” “emit valid JSON,” etc.).  
- **Context** (canon, glossary, local examples)—attached, not merged into instructions.

# 3) Folder layout that enforces the separation

```
.ai/
  config.yml         ← domain name, provider default, context allowlist, output prefs
  system.md          ← short project identity/scope (domain-agnostic)
  rules/             ← numbered, single-purpose files (deterministic order)
  context/           ← explicitly attached references (canon, glossary, briefs)
  providers/
    openai/overlay.md
    anthropic/overlay.md
    gemini/overlay.md
  templates/         ← seeded by packs; yours to edit freely
```

- **Knowledge packs** are just versioned folders you can publish (or keep private).  
- **Provider overlays** hold only provider-specific *hints* (e.g., “prefer JSON output”); they never redefine domain content.

# 4) Governance & growth (so curation stays manageable)

- **Version your packs (semver)** and keep a **CHANGELOG** with human notes (“tightened beat vocabulary; added character arc test prompts”).  
- **Compatibility table**: which sections assume which provider features (e.g., strict JSON).  
- **Review cadence**: when a rule grows beyond a screen, split it; when two rules conflict, resolve by renaming/ordering—never by hidden precedence.  
- **Snapshots**: keep “golden runs” (input → output) for a handful of tasks per domain; use them to detect regressions in tone/structure. (No code needed now—just the practice.)  
- **Open-source hygiene**: a `CONTRIBUTING` doc that explains section types, naming, and how to propose changes; license text lives with the pack, not the tool.

# 5) Tool behaviors (to protect the boundary)

- **Explainability first:** `explain` prints the *exact* assembly plan: files, gates, sizes, final bundle hash.  
- **Allowlist only:** include from `context/` and configured globs—no repo-wide slurping.  
- **No knowledge in the binary:** the tool ships with zero domain content; template packs are separate artifacts (local path or catalog).  
- **Profiles are overlays, not packs:** they tweak params (temperature, output mode) without touching knowledge.  
- **Reproducibility:** every run writes a tiny `runs/manifest` (bundle hash, provider, model, cost) so you can trace any result back to the knowledge state.

# 6) Why this scales (solo → team)

- You can open-source the **packs** (curated knowledge), keep your **project overrides** private, and swap **providers** without touching knowledge.  
- Teams can standardize on a common pack, then let repos specialize with a few local rules—no forking the universe.

---

If you want, I can distill this into a one-page **Prompt Assembly Spec** (fields, section types, order, gates, and lifecycle) so you have a crisp contract before anyone writes a line of code.

<me>
how would you create a structured summary for this discussion?I'd like to have a comprehensive one, including the pain, the idea, sketch of core features, questions to consider

<ai>
# Structured Summary — Domain-Agnostic LLM Wrapper (Tool ↔ Knowledge ↔ Assembly)

## 0) Executive summary
You want a **boring, predictable CLI** that separates:
- **Tooling** (keys, models, params, requests) from  
- **Knowledge** (domain packs you curate: scripting, coding, research) with  
- a thin, **deterministic assembly layer** that turns curated rules into a single system-prompt bundle.

The aim: reproducible runs, transparent provenance, and an ecosystem where your **knowledge** can be open-sourced or private, while the **tool** stays neutral and minimal.

---

## 1) Pain & context
- **Terminal friction:** raw APIs are powerful but clunky; repetitive setup (keys, models, flags).
- **Conflated concerns:** most tools tangle “how to call the model” with “what we tell the model.”
- **Unclear provenance:** hard to see *which* rules/prompt fragments influenced an answer.
- **Non-deterministic assembly:** ad-hoc concatenation leads to drift and inconsistent results.
- **Portability risk:** provider specifics (roles, JSON modes, tool formats) leak into prompts.
- **Curation overhead:** no clean guidance for growing a knowledge base over time.

---

## 2) Core idea
- A **domain-agnostic CLI** that:
  1) **Loads config** with git-style precedence (project → parent → global).
  2) **Assembles a prompt bundle** from domain packs + project overrides + provider overlays.
  3) **Normalizes a request** to any provider (OpenAI/Anthropic/Gemini).
  4) **Presents output** (stream to TTY, or strict JSON/markdown to file).
- The **knowledge** lives as human-readable files you curate (and optionally open-source).
- The **assembly** is small, rule-based, and **deterministic** (same inputs → same bundle hash).

---

## 3) Design principles
- **Separation of concerns:** Tool ≠ Knowledge ≠ Assembly.
- **Determinism:** numeric ordering + explicit gates; no implicit scans.
- **Explainability:** every run can print the exact bundle + sizes + file origins.
- **Minimalism:** no agenting/RAG by default; opt-in later.
- **Portability:** one internal request schema mapped to providers.
- **Safety by allowlist:** only include declared `context/` files; no repo-wide ingestion.

---

## 4) Architecture at a glance
**Layers**
1) **Tool (plumbing):** keys, model, params, provider adapters, output modes.
2) **Knowledge (content):** domain packs (scripting/coding/research), project rules, provider overlays.
3) **Assembly (glue):** ordered include, simple gates, bundle manifest + hash.

**Contract**  
`{ provider, model, params, bundle(manifest, system, context, options) }`

---

## 5) Artifacts & folder layout
```
.ai/
  config.yml            # domain, provider_default, output mode, context allowlist (globs)
  system.md             # short project identity/scope (domain-agnostic)
  rules/                # numbered, single-purpose files; deterministic order
    10-identity.md
    20-domain-principles.md
    30-guardrails.md
    40-task-modes.md
    50-style.md
    60-output-format.md
  context/              # canonical references explicitly attached (glossary/canon/examples)
  providers/
    openai/overlay.md
    anthropic/overlay.md
    gemini/overlay.md
  templates/            # local copies from chosen domain pack; you edit these
  .aiignore             # future-proofing if scanning is ever enabled (default: off)
```

---

## 6) Prompt assembly spec (minimal, testable)
**Operators**
- **include** (file content), **order** (numeric prefix), **section** (`system` vs `context`),
- **when** (gates: by `domain`, `provider`, optional `task` tag),
- **max-size hint** (tool can warn; you decide).

**Order of assembly**
1) `system.md`  
2) Domain pack rules (numeric order)  
3) Provider overlay (only chosen provider)  
4) Project `rules/` (numeric order)  
5) Attach `context/` (allowlisted in `config.yml`)  
→ Emit **bundle manifest** (file list, sizes, gates applied, final hash).

**Gating**
- Tiny header at top of rule files (key–value):  
  `domain: scripting | coding | any`  
  `provider: openai | anthropic | gemini | any`  
  `task: beat-sheet | code-review | any`  
- Additive allowlists; if it doesn’t match, it’s skipped—no boolean soup.

---

## 7) MVP feature sketch
- **Config precedence:** project `.ai` → nearest parent `.ai` → `~/.ai`.
- **Domain packs:** `ai init` seeds `.ai/` with chosen pack (scripting/coding/research/blank).
- **Assembly & explain:** `ai run "prompt"` and `ai explain` (shows bundle, sizes, hash).
- **Provider adapters:** one internal schema → adapters for OpenAI/Anthropic/Gemini.
- **Keys:** env first; optional `~/.ai/keys.env` or OS keychain.
- **Output modes:** stream; `--json`; `--file out.md`.
- **Manifests:** `runs/` folder stores bundle hash, provider, model, token/cost stats.

**CLI surface (v1)**
- `ai init` · `ai run` · `ai explain` · `ai domain add <name>` · `ai doctor` · `ai cache clear`

---

## 8) Governance & growth of the knowledge base
- **Semver your packs** + CHANGELOG (“tightened beat vocabulary”, “added character-arc checks”).
- **Contribution guide** for open-sourcing packs (section types, naming, gates, PR rules).
- **Split rules early** (keep files short; one intent per file).
- **Golden snapshots** (a few example tasks per domain to watch for regressions in tone/structure).

---

## 9) Security, trust, and privacy
- **Allowlist only** for `context/` and configured globs; no automatic repo ingestion.
- **Redacted logs**; opt-in storage of transcripts; retention policy in `config.yml`.
- **Reproducibility:** every run can be traced back to exact knowledge state (bundle hash).

---

## 10) Performance knobs (later)
- **Bundle cache:** hash(assembled files) → reuse.
- **Provider prompt caching:** toggled in provider overlays.
- **Budget awareness:** token estimates per section; warnings before send.

---

## 11) Deliberate non-goals (for v1)
- No autonomous agents, RAG, or code execution.
- No heuristic repo scans; no “AI magic” merging.
- No opinionated UI beyond clean terminal streaming and basic files.

---

## 12) Adoption path (solo → team)
- Ship the **tool** with zero domain content.
- Publish **packs** separately (you can OS them) and keep **project overrides** private.
- Teams standardize on a common pack and let repos specialize via a few local rules.

---

## 13) Questions to consider (decision log fodder)
**Knowledge & domains**
- Which **three domain packs** are day-one (scripting, coding, research)? Any sub-modes (e.g., beat-sheet vs outline)?
- What’s your **style & output policy** per domain (strict JSON for coding; markdown for scripting)?

**Assembly rules**
- Is the **gating header** limited to `domain/provider/task` for v1? Any other keys?
- Do we allow **provider-specific reformatting** in overlays, or overlays only for hints?

**Config & UX**
- What’s the **minimal `config.yml`** (domain, provider_default, output mode, context allowlist)? Anything else?
- `ai init`: interactive questions vs flags? Seed example rules or keep it blank?

**Privacy & logging**
- Default **run logging** on or off? What fields? Retention?
- Do you want a **`--dry-run`** mode that prints bundle and exits?

**Portability & providers**
- Which **models** must work on day one? Any hard requirements (structured outputs, tool calling)?
- How strict should **JSON mode** be (auto-repair vs fail-fast)?

**Distribution & governance**
- Where do **packs live** (local dir, git URL, catalog)? Versioning scheme? Licenses?
- How to manage **breaking changes** in packs (compat tables, migration notes)?

**Trust & safety**
- Any **provenance watermark** in outputs (embed bundle hash in footer)?
- Policy for **sensitive contexts** (e.g., secrets in `context/`)—warn or block?

---

## 14) Next steps (practical, no code yet)
1) **Name the day-one domain packs** and list the first 5–7 rules each will contain.  
2) **Freeze the assembly spec v1** (operators, order, gating header keys).  
3) **Define minimal `config.yml`** schema and defaults.  
4) **Decide init UX** (what files the user sees after `ai init`).  
5) **Pick default logging/retention** and the “explain/dry-run” expectations.

---

## 15) Success criteria (how we’ll know it’s working)
- **Determinism:** same repo state → same bundle hash → same outputs (within model variance).
- **Transparency:** `ai explain` makes provenance obvious (humans can audit quickly).
- **Portability:** switching providers requires **zero** changes to knowledge files.
- **Maintainability:** domain packs evolve independently of the tool; contributions are easy.
- **Adoption:** you use it daily without fighting it; adding a new project is a <1-minute ritual.

---

If you want, I can turn this into a one-page **Prompt Assembly Spec v1** (fields + examples of rule headers + the exact assembly order) and a **Domain Pack Outline** (scripting/coding/research rule lists) so you can socialize and iterate before any implementation.

<me>

<ai>

<me>

<ai>

<me>

<ai>

<me>

<ai>

