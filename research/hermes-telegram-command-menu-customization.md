---
date: 2026-06-22
model: claude-sonnet-4-6
description: "Research into documented/supported ways to customize the Telegram bot slash-command menu in NousResearch Hermes Agent, including command priority, MAX_COMMANDS_PER_SCOPE, and plugin/skill command registration"
---

# Hermes Agent: Telegram Command Menu Customization

## Question

For NousResearch's Hermes Agent (Python CLI agent from hermes-agent.nousresearch.com, running a "gateway" with a Telegram polling adapter):

1. Is there any **documented or supported** way to customize the Telegram bot's slash-command menu (Telegram `setMyCommands`)?
2. Are there documented **config keys, CLI subcommands, plugin APIs, hooks, or skill/bundle frontmatter** to (a) add custom/role-specific commands to the bot menu, (b) control/hide which commands appear, or (c) set or raise a command's **priority** so a custom command wins a visible slot?
3. Is the **command priority order** configurable, and is the **30-command cap** (`MAX_COMMANDS_PER_SCOPE`) configurable or documented?
4. Any official guidance/examples on exposing **custom commands** in the Telegram command menu specifically?

## Direct Answer

**No** — as of Hermes Agent v0.17.0 (released 2026-06-19), there is no documented or supported mechanism to customize command priority in the Telegram bot menu, raise a plugin/skill command's priority, configure the 30-command cap, or guarantee that custom/curator commands appear in visible Telegram menu slots.

The answer to each sub-question:

- **(a) Add custom/role-specific commands to the bot menu:** Partially — `ctx.register_command(name, handler, description)` in a plugin will register the command, and the documentation states it "appears in Telegram bot menu." However, due to the `_TELEGRAM_MENU_PRIORITY` ordering and the `MAX_COMMANDS_PER_SCOPE = 30` cap, plugin-registered commands are pushed beyond slot 30 and are truncated. This is a known open bug (issue #33480).
- **(b) Control/hide which commands appear:** Partially — `user_allowed_commands` in `gateway-config.yaml` controls which commands *execute* for regular users (access control), but does not control what appears in the Telegram menu's visual command list.
- **(c) Set or raise a command's priority:** No — `_TELEGRAM_MENU_PRIORITY` is a hardcoded tuple in `gateway/platforms/telegram.py`. There is no documented config key, plugin API field, or frontmatter that lets any caller raise a command's priority or reserve a slot.
- **30-command cap:** Not configurable. `MAX_COMMANDS_PER_SCOPE = 30` is hardcoded. A feature request (issue #18336) to add an allowlist config was filed and closed with P3 (low priority), no implementation.
- **Command priority order:** Not configurable.
- **Official guidance for custom commands in Telegram menu:** None found. The official Telegram integration docs suggest using BotFather's `/setcommands` manually — a static workaround entirely outside Hermes.

## Findings

### Finding 1: Plugin command registration via `ctx.register_command`

The plugin API exposes:

```python
ctx.register_command(name: str, handler: Callable, description: str = "", args_hint: str = "")
```

The official docs state this "adds `/name` in CLI and gateway sessions" and that `description` is "Shown in `/help`, autocomplete, and Telegram bot menu." There is no `priority` parameter documented, and no Telegram-specific parameter.

Additionally, the docs note: "If a plugin tries to register a name that conflicts with a built-in command (`help`, `model`, `new`, etc.), the registration is silently rejected with a log warning."

- **Source:** [Build a Hermes Plugin guide](https://hermes-agent.nousresearch.com/docs/guides/build-a-hermes-plugin) — accessed 2026-06-22
- **Source:** [Plugins feature docs (GitHub)](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/plugins.md) — accessed 2026-06-22
- **Tag:** Verified from official documentation

### Finding 2: `MAX_COMMANDS_PER_SCOPE = 30` is hardcoded; plugin commands are truncated

Bug report #33480 ("Plugin slash commands truncated by 30-command cap in Telegram menu") confirms:

- `MAX_COMMANDS_PER_SCOPE = 30` is hardcoded in `gateway/platforms/telegram.py`.
- `_TELEGRAM_MENU_PRIORITY` assigns priority 0 to approximately 18 built-in commands and priority 1 to plugin commands.
- With ~48 total commands, plugin commands fall beyond position 30 and are excluded from the Telegram menu.
- Telegram officially allows 100 commands per scope; the 30-limit was set due to an "undocumented payload size limit (~4KB total)."
- The issue proposes raising `MAX_COMMANDS_PER_SCOPE`, assigning higher priority to plugin commands, or implementing a user-configurable allowlist (referencing feature request #18336).
- Status: Open, P3 (low priority). A related PR #42021 is mentioned but no resolution is provided.

- **Source:** [Bug #33480: Plugin slash commands truncated by 30-command cap in Telegram menu](https://github.com/NousResearch/hermes-agent/issues/33480) — accessed 2026-06-22
- **Tag:** Verified from GitHub issue (corroborated by code-reading described in the research brief)

### Finding 3: Feature request for command allowlist config was filed, closed, not implemented

Feature request #18336 ("Add Telegram command allowlist config option") proposed:

```yaml
telegram:
  commands:
    allowlist:
      - help
      - stop
      - restart
    max_skills: 10
```

- Status: **Closed** with labels P3, area/config, platform/telegram.
- No linked PRs, no maintainer response visible, no evidence of implementation.

- **Source:** [Feature Request #18336: Add Telegram command allowlist config option](https://github.com/NousResearch/hermes-agent/issues/18336) — accessed 2026-06-22
- **Tag:** Verified from GitHub issue

### Finding 4: `user_allowed_commands` controls execution access, not menu appearance

The official Telegram docs and slash-commands reference document a `user_allowed_commands` config key:

```yaml
gateway:
  platforms:
    telegram:
      extra:
        allow_admin_from:
          - "123456789"
        user_allowed_commands:
          - status
          - model
          - history
```

This controls which commands **execute** for non-admin users (access control), and explicitly states that `/help` and `/whoami` are always permitted. It does **not** control which commands appear visually in the Telegram bot's slash-command menu.

- **Source:** [Telegram user guide](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/telegram/) — accessed 2026-06-22
- **Source:** [Slash Commands Reference (GitHub)](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/slash-commands.md) — accessed 2026-06-22
- **Tag:** Verified from official documentation

### Finding 5: Quick commands work in Telegram but likely do not appear in the bot menu

The configuration docs describe `quick_commands` in `~/.hermes/config.yaml` as:

> "zero-token and useful from messaging platforms (Telegram, Discord, etc.) for quick server checks or utility scripts"

These are universal across all platforms (CLI, Telegram, Discord, Slack, etc.). However, the docs explicitly note that "quick commands are resolved at dispatch time and may not appear in every built-in autocomplete/help table."

There is no documented mechanism to push a quick command into the Telegram `setMyCommands` menu. A third-party Medium article mentioned a `messaging.telegram.commands` config key and a `hermes config set messaging.telegram.commands` CLI call, but this key does not appear in the official documentation, configuration reference, or slash commands reference, and is likely hallucinated or fabricated content.

- **Source:** [Configuration docs](https://hermes-agent.nousresearch.com/docs/user-guide/configuration/) — accessed 2026-06-22
- **Unverified claim discarded:** `messaging.telegram.commands` from [Medium article by Rost Glukhov](https://medium.com/@rosgluk/hermes-agent-cli-cheat-sheet-commands-flags-and-slash-shortcuts-011b38cf437a) — not corroborated by official docs

### Finding 6: v0.17.0 release notes contain no Telegram command menu changes

The v0.17.0 ("The Reach Release", 2026-06-19) release notes mention only these Telegram changes:
- Bot API 10.1 rich messages (always-on with opt-out)
- MarkdownV2 on progress edits
- Stopped cutting long streamed responses
- Gate oversized voice/audio before download

No changes to command menu, command priority, `MAX_COMMANDS_PER_SCOPE`, or plugin command visibility.

- **Source:** [Release Hermes Agent v0.17.0 (v2026.6.19)](https://github.com/NousResearch/hermes-agent/releases/tag/v2026.6.19) — accessed 2026-06-22
- **Tag:** Verified from official release notes

### Finding 7: Bug with profile-specific Telegram command registration

Bug #8108 ("Profile Telegram gateways register only core command set instead of full skill menu") reports that profile bots register only 29 commands (the core set) rather than the full 100-command skill-backed menu. Root cause: `_skill_commands` is a process-global cache populated at `cli.py` import time, making it non-profile-aware. A workaround exists ("post-start refresh that explicitly recomputes and pushes Telegram commands for each profile") but the issue is open with no assigned resolution.

- **Source:** [Bug #8108: Profile Telegram gateways register only core command set](https://github.com/NousResearch/hermes-agent/issues/8108) — accessed 2026-06-22
- **Tag:** Verified from GitHub issue

### Finding 8: Official Telegram setup docs suggest BotFather manual configuration as the workaround

Both the main Telegram docs and the Team Telegram Assistant tutorial suggest using BotFather's `/setcommands` to manually define the command menu visible to users. This is a static Telegram-side configuration, entirely outside Hermes. It does not affect what Hermes dispatches — it only controls the visual menu in the Telegram client.

- **Source:** [Tutorial: Team Telegram Assistant](https://hermes-agent.nousresearch.com/docs/guides/team-telegram-assistant/) — accessed 2026-06-22
- **Source:** [Telegram user guide](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/telegram/) — accessed 2026-06-22
- **Tag:** Verified from official documentation

## Synthesis and Recommendation

The code-reading conclusion is confirmed by authoritative sources: **there is no supported, configuration-driven way to raise a custom command's priority or guarantee its appearance in the Hermes-managed Telegram command menu**.

The three possible paths forward are:

**Path A: BotFather `/setcommands` (static workaround, already known)**
Use Telegram's own `/setcommands` to publish whatever commands you want in the visual menu. This is independent of what Hermes auto-publishes via `setMyCommands`. Hermes will still dispatch any `/command` it receives; the menu is purely cosmetic on Telegram's side. Limitation: this list is static and won't track dynamic plugin commands.

**Path B: Source patch — raise priority or increase cap (not upstream-supported)**
Edit `gateway/platforms/telegram.py` to either (1) add the curator plugin's commands to `_TELEGRAM_MENU_PRIORITY` at a low index, or (2) raise `MAX_COMMANDS_PER_SCOPE` beyond 30. This directly solves the problem. Risk: any Hermes update overwrites the patch. The bug report (#33480) confirms this is the right file and the right variables. This approach requires maintaining a local fork or patch file.

**Path C: Wait for upstream resolution**
Issues #33480 and #18336 both describe the problem, but both carry P3 (low priority) and have no assigned resolution or linked PR. Given no activity and P3 classification, this is not a near-term prospect.

**Recommended decision:** If the goal is curator-specific commands appearing in the Telegram menu now, **Path B** (a minimal local patch to `gateway/platforms/telegram.py`) is the only reliable option. Path A is a viable complement for discoverability but does not integrate with Hermes's live command registry.

## Confidence and Gaps

**High confidence (multiple independent sources):**
- `MAX_COMMANDS_PER_SCOPE = 30` is hardcoded (bug report + code-reading)
- `_TELEGRAM_MENU_PRIORITY` is a hardcoded tuple (bug report + code-reading)
- Plugin commands are excluded from the Telegram menu by priority ordering (bug report)
- No config key controls command priority (config docs, plugin API docs, issue tracker)
- Feature request #18336 (allowlist config) was filed and closed with no implementation

**Single-source (credible, from official GitHub issues):**
- The "~4KB payload size limit" rationale for the 30-cap (from issue #33480 — plausible but not independently verified)
- The profile-scoped caching bug described in #8108

**Could not verify:**
- Whether PR #42021 (referenced in issue #33480) contains a partial fix — the PR content was not accessible via WebFetch (404). This is the main gap.
- Whether the `messaging.telegram.commands` config key mentioned in a third-party Medium article is real — it does not appear in any official source and should be treated as unverified/likely fabricated.

**What would close the gap:**
- Reading PR #42021 in full to determine whether it partially addresses command priority
- Checking the installed `gateway/platforms/telegram.py` on the production host to confirm exact current `_TELEGRAM_MENU_PRIORITY` contents and whether any `gateway_config_gate` wraps `MAX_COMMANDS_PER_SCOPE`
