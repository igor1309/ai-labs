- Never run `launchctl`, `env`, `printenv` or `security`.
- Change only what the brief's Done when needs. A test outside the step that
  fails or times out is not yours to fix: rerun it alone, and report its name
  and result. Never edit another target's code or tests to make it pass
  (builders rewrote capture code three times on 2026-10-27 after an
  unrelated timeout).
- Do not add module-checker scripts.
