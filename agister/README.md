# Agister

Agister runs AI-agent work that is defined as settings, through provider
runtimes, in the caller's git worktree, and keeps an attributable record of
every call.

It is being rewritten from scratch to
[its architecture, ADR-001](docs/adr/001-agister-architecture.md); each
behaviour comes in an ADR of its own, starting with
[settings, ADR-002](docs/adr/002-settings.md). The earlier
implementation, with its ADRs, behaviour reference and tests, is kept
unchanged in [archive/](archive/README.md) as reference; it is not built or
tested in CI. The installed `agister` binary is that implementation.
