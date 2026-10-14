# Agister

Agister runs AI-agent work that is defined as settings, through provider
runtimes, in the caller's git worktree, and keeps an attributable record of
every call.

It is being rewritten from scratch to
[its top-level architecture](docs/architecture/top-level.md). The earlier
implementation, with its ADRs, behaviour reference and tests, is kept
unchanged in [archive/](archive/README.md) as reference; it is not built or
tested in CI. The installed `agister` binary is that implementation.
