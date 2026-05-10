---
date: 2026-05-09
author: Igor Malyarov
version: 0.0.3
---

# Automated Doc Drift Review and Fix Suggestions. Intent

`ai-labs` is a mono-repo with multiple projects.

Each project has its own README. The repo also has a root README.

The intent is to detect when READMEs drift from each other or from the actual repo state, and to help the maintainer decide what should be fixed.

## User stories

As a repo maintainer,
I want to be notified when READMEs drift,
so I can notice documentation problems without checking manually.

As a repo maintainer,
I want to initiate doc drift analysis manually,
so I can check docs when I need to.

As a repo maintainer,
I want to receive README fix suggestions as PRs,
so I can review and accept documentation changes through the normal repo flow.

## Success

Success means the maintainer can see:

- what drift was found
- what evidence supports it
- what README change is suggested
- which fixes are proposed as PRs

## Boundaries

The maintainer decides whether a drift finding is valid.

The maintainer decides whether to accept a README fix.

Auto-merge is out of scope.