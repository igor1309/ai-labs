# Agonara Skills

Operator-facing skills for [Agonara](https://github.com/igor1309/agonara), packaged for a
"bring your own agent" (BYOA) workflow: point the agent you already use at an
Agonara instance and load the skill folder for the job you are doing.

This repository is **generated** — it is a deterministic, privacy-scrubbed
projection of Agonara's canonical `agonara/skills/` tree. Do not edit it here;
changes are made upstream and republished.

## Layout

Skills are split into two role-scoped folders. Install the folder for your role:

- **`student/`** — skills for a learner's assistant: study accepted material, take
  checks, get coached, and run authored practice drills.
- **`curator/`** — skills for a Program Curator's assistant: build a program,
  control the draft↔accepted boundary, author assessments, and manage
  participation.

Each folder carries the shared foundations (`agonara-api-access`,
`agonara-membership`) alongside its role skills, so a folder installs and runs on
its own.

## Provenance

Every release records its origin in `provenance.json` at the repository root: the
upstream commit it was generated from and a `sha256` content hash per skill tree.
Pin an immutable release tag and verify the hashes to install a known, unmodified
artifact.

## License

[MIT](LICENSE).
