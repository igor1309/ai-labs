# Workflows — Agent Instructions

## Architecture

See `README.md` in this directory for workflow categories and paths-ignore policy.

## Rules

- Each project gets its own `<project>-core.yml` reusable workflow. Do not add cross-project deps to another project's workflow.
- `ci.yml` is the dispatcher — it routes to per-project workflows via `dorny/paths-filter`. Do not add test steps directly to `ci.yml`.
- All failure notifications go through `notify-telegram-failure.yml`. Do not add inline notification steps.
- Scheduled workflows must document timezone conversion in comments (cron is UTC, target is Moscow UTC+3).
- `paths-ignore` in `ci.yml` is the single source of truth for which directories skip CI. Per-project workflows rely on the dispatcher's path filters instead.
