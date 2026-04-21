# Workflows — Agent Instructions

## Architecture

See `README.md` in this directory for workflow categories and path filtering policy.

## Rules

- Each project gets its own `<project>-core.yml` reusable workflow. Do not add cross-project deps to another project's workflow.
- `ci.yml` is the dispatcher — it routes to per-project workflows via `dorny/paths-filter`. Do not add test steps directly to `ci.yml`.
- All failure notifications go through `notify-telegram-failure.yml`. Do not add inline notification steps.
- Scheduled workflows must document timezone conversion in comments (cron is UTC, target is Moscow UTC+3).
- `ci.yml` does not use top-level `paths-ignore`. All path filtering is handled by `dorny/paths-filter` inside the `changes` job. This ensures the `report` required check always runs. Do not add `paths-ignore` to `ci.yml`.
