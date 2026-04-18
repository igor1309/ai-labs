# notio — Change Log

## 2026-04-18

- Implemented Step 3 first service slice: Swift/Hummingbird service with health, version, and webhook ack endpoints, structured JSON logging, env-driven config, Dockerfile, and release unit registration. 8 tests pass.



- Locked the first real service slice to Swift + Hummingbird in ADR-002 and the bring-up plan so Step 3 no longer leaves room for stack drift.
- ADR-001…005 are now internally consistent and aligned with the ADR structure template and review standard; ADR-003 is the single source of truth for the v1 storage backend.
- Spec files live under `docs/specs/`; pre-ADR Supabase note is archived.
