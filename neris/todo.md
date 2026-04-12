# neris — TODO

## CI

- [ ] Add `neris-core.yml` workflow for `swift-neris` tests
  - path filter: `neris/packages/swift-neris/**`
  - install Swift toolchain, run `swift test`
  - follow per-project CI isolation pattern (see `CLAUDE.md`)
- [ ] Wire `neris-core.yml` into `ci.yml` dispatch

## Release (later)

- [ ] Add `neris` as a release unit in `release-units.config.toml`
- [ ] Add `release.toml` (non-Node unit) with initial version to `swift-neris`
- [ ] Verify release detection script picks up `swift-neris` correctly
- [ ] Add release notes entry in `neris/docs/log.md` at first release
