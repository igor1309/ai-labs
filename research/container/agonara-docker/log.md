# Agonara Docker Dev Sandbox — Log

## 2026-06-13

- **End-to-end loop verified** in container `agonara-dev:latest` (via OrbStack): `gh auth
  login` → `gh repo clone igor1309/ai-labs` (private, on `trunk` @ 1fb2b284) → `npm
  install` (515 pkgs, 33s, `better-sqlite3` prebuilt — no compile) → `npm test
  --workspace agonara` exit 0, 727/727 tests pass. Confirmed the playbook flow works
  inside the sandbox. (Push + `gh pr create` not exercised — needs real work on a branch.)
- Authored `Dockerfile` (node:22-bookworm + git/gh/build-deps + `claude`/`codex` CLIs,
  non-root) and `playbook.md` (build → run → clone → work → test → PR) for an isolated
  agonara dev container. Scope: agonara only; Swift backends deferred.
- Decided isolation contract: clone repo inside the container (no host bind-mount),
  in-container auth persisted via a `/home/node` named volume, no docker socket, no
  `--privileged`, resource limits on.
- **Build verified** via OrbStack daemon. `docker build -t agonara-dev:latest` succeeded;
  smoke test confirmed: non-root user `node` (uid 1000), Node v22.22.3, git 2.39.5,
  gh 2.94.0, `claude` 2.1.177, `codex-cli` 0.139.0. npm packages
  `@anthropic-ai/claude-code` and `@openai/codex` and the gh apt repo install all
  resolved.
- Verified on host: agonara `test` = `node --test tests/*.test.js && openapi:check &&
  openapi:lint`; `start` = `node src/server.js`; Node v22.21.1; `claude` and `codex`
  binaries present.
