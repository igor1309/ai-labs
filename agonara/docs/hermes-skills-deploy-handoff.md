---
date: 2026-06-30
model: claude-opus-4-8
title: hermes-skills-deploy-handoff
description: "Handoff package for the operator/inventory owner: auto-deploy the Agonara student-bot skill set from ai-labs to the live Hermes agent. Carries drafts, decisions, and open questions — not a deployment that runs from ai-labs."
status: draft-handoff
---

# Handoff — Auto-deploy Agonara skills to Hermes

## Ownership boundary (why this is a handoff, not an ai-labs workflow)

ai-labs is the **source of truth for skill content only**. The concrete
deployment to a live runtime — host address, deploy key, target skills
directory, restart behavior, update cadence — is the **consuming runtime's /
operator inventory's** concern (`skills/README.md` → "Deploying these skills";
`docs/deployment-discipline.md` keeps host details out of this repo). A live
`.github/workflows/*.yml` in ai-labs would make ai-labs own and execute the
Hermes deploy, crossing that boundary. So the wiring below is **drafted here for
transfer** to the inventory owner to implement and run where the deployment
lives — it is not active in ai-labs.

## What to deploy

The **student-facing co-installing set** only. Hermes runs student bots (the
"Hermes student profile tree"). Per the packaging rules in `skills/README.md`,
the curator and admin role buckets **never co-install with student** — do not
ship them to a student bot.

Deploy these folders from `agonara/skills/`:

```
agonara-api-access
agonara-membership
agonara-student
button-quiz-loop
assistant-authored-study-drills
oral-exam-drills
```

Exclude (separate role buckets, different consumers): `agonara-admin`,
`agonara-curator-corpus`, `agonara-curator-assessment`,
`agonara-curator-research`, `agonara-curator-participation`.

Only the skill *folder* ships (its `SKILL.md` + own subfiles). Hermes
auto-discovers dropped-in `SKILL.md` folders (`docs/byoa-student-agent-connect.md`).

## Constraints to preserve

- **No host details in any repo.** Host, user, target dir, and deploy key come
  from secrets/inventory, never committed (`docs/deployment-discipline.md`). This
  is stricter than ai-labs' existing OpenClaw `*-agent-sync.yml` workflows, which
  hardcode their VPS IP — do not copy that shortcut.
- **Per-folder `rsync --delete`.** Sync each managed skill folder individually so
  `--delete` prunes only stale files *inside* an Agonara skill, never sibling
  skills the operator maintains directly on the Hermes host.
- **Verify post-sync.** Confirm each expected `SKILL.md` landed on the host.

## Required secrets (provision in the deploying repo/inventory)

| Secret | Meaning |
|---|---|
| `HERMES_DEPLOY_SSH_KEY` | Private deploy key authorized on the Hermes host |
| `HERMES_DEPLOY_HOST` | Host/IP of the Hermes VPS |
| `HERMES_DEPLOY_USER` | SSH user that owns the Hermes profile |
| `HERMES_SKILLS_DIR` | Absolute path to the Hermes skills directory |

## Open question — cross-repo source of skill content

The reference workflow below assumes it runs **in a repo that already has
`agonara/skills/`** (i.e. ai-labs). If the deploy lives in the inventory repo
instead, it must first obtain the skill content from ai-labs at a pinned ref —
e.g. clone/checkout ai-labs, consume a published release artifact, or a git
submodule. That integration choice belongs to the inventory owner and is the
main thing to decide before implementing.

## Reference workflow (draft — adapt to where it will run)

Trigger on changes to the skill set; stage the student set; rsync per folder;
verify. Failure notification is wired the ai-labs way (`notify-telegram-failure.yml`)
and should be swapped for whatever the deploying repo uses.

```yaml
name: Sync Agonara skills to Hermes

on:
  push:
    branches: [trunk]
    paths:
      - 'agonara/skills/**'
      - '.github/workflows/agonara-hermes-skills-sync.yml'
  workflow_dispatch:

concurrency:
  group: agonara-hermes-skills-sync
  cancel-in-progress: false

permissions:
  contents: read

jobs:
  sync:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v5   # in inventory repo: also fetch ai-labs skills at a pinned ref

      - name: Stage student skill set
        run: |
          set -euo pipefail
          staging=/tmp/agonara-hermes-skills
          rm -rf "$staging"; mkdir -p "$staging"
          skills="agonara-api-access agonara-membership agonara-student \
                  button-quiz-loop assistant-authored-study-drills oral-exam-drills"
          for s in $skills; do
            src="agonara/skills/$s"
            [ -f "$src/SKILL.md" ] || { echo "Missing $src/SKILL.md" >&2; exit 1; }
            rsync -a "$src" "$staging/"
          done
          ls -1 "$staging"

      - name: Configure SSH
        env:
          DEPLOY_KEY: ${{ secrets.HERMES_DEPLOY_SSH_KEY }}
          HERMES_HOST: ${{ secrets.HERMES_DEPLOY_HOST }}
        run: |
          set -euo pipefail
          mkdir -p ~/.ssh; chmod 700 ~/.ssh
          printf '%s\n' "$DEPLOY_KEY" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519
          ssh-keyscan -H "$HERMES_HOST" >> ~/.ssh/known_hosts 2>/dev/null

      - name: Rsync skills to Hermes
        env:
          HERMES_HOST: ${{ secrets.HERMES_DEPLOY_HOST }}
          HERMES_USER: ${{ secrets.HERMES_DEPLOY_USER }}
          HERMES_SKILLS_DIR: ${{ secrets.HERMES_SKILLS_DIR }}
        run: |
          set -euo pipefail
          # Per-folder --delete: prune only inside each Agonara skill, never siblings.
          for dir in /tmp/agonara-hermes-skills/*/; do
            name="$(basename "$dir")"
            rsync -az --delete \
              -e "ssh -i ~/.ssh/id_ed25519 -o StrictHostKeyChecking=yes" \
              "$dir" "${HERMES_USER}@${HERMES_HOST}:${HERMES_SKILLS_DIR}/${name}/"
          done

      - name: Verify sync
        env:
          HERMES_HOST: ${{ secrets.HERMES_DEPLOY_HOST }}
          HERMES_USER: ${{ secrets.HERMES_DEPLOY_USER }}
          HERMES_SKILLS_DIR: ${{ secrets.HERMES_SKILLS_DIR }}
        run: |
          set -euo pipefail
          for name in agonara-api-access agonara-membership agonara-student \
                      button-quiz-loop assistant-authored-study-drills oral-exam-drills; do
            ssh -i ~/.ssh/id_ed25519 -o StrictHostKeyChecking=yes \
              "${HERMES_USER}@${HERMES_HOST}" \
              "test -f '${HERMES_SKILLS_DIR}/${name}/SKILL.md'" \
              || { echo "Missing on host: ${name}/SKILL.md" >&2; exit 1; }
          done
          echo "All student skills present on Hermes host."
```

## Checklist for the inventory owner

- [ ] Decide how the deploying repo obtains ai-labs skill content (clone / artifact / submodule).
- [ ] Provision the four `HERMES_*` secrets and authorize the deploy key on the host.
- [ ] Confirm `HERMES_SKILLS_DIR` is the directory Hermes auto-discovers `SKILL.md` folders in.
- [ ] Confirm Hermes picks up dropped-in folders without a restart, or add a reload step.
- [ ] First run via `workflow_dispatch`; verify the six folders, then enable on push.
- [ ] Confirm whether any curator/admin Hermes bot exists — if so, scope a separate deploy with the correct bucket; do not co-install with student.
