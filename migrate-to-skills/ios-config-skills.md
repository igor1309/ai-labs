---
date: 2026-04-21
model: claude-opus-4-6
description: "Migration plan for ios.config/.claude skills to dev-skills — extraction candidates"
---

# iOS Config Skills — Move with Extraction

Source: `ios.config/.claude/` (iFora iOS app)
Target: `dev-skills/public/` (ai-labs)

Strategy: extract generic pattern into dev-skills, keep thin repo-level skill in ios.config that extends with Vortex specifics.

| Name | Type | Domain | What to extract | What stays in repo |
|------|------|--------|-----------------|-------------------|
| response-mapping | skill | Backend | DTO/validation/mapping templates, testing guide | Vortex file references, example paths |
| create-request | skill | Backend | Request factory pattern (POST payload, GET serial) | Vortex module paths, RemoteServices refs |
| routing-wiring-pattern | skill | Architecture | Equatable projection pattern, context factory rules | RootViewModelFactory, ViewComponents refs |
| rootviewmodel-factory-rx-patterns | skill | Architecture | RxViewModel composition pattern (Reducer, EffectHandler, binder) | Domain namespace examples, factory wiring |
| compose-serial-loaders | skill | Architecture | Serial-based cache invalidation pattern | LocalAgent specifics, factory file refs |
| config-static-instances | skill | Architecture | "No static preview helpers in shared types" rule | CompositionRoot/Configs convention |
| rootviewmodelfactory-tests | skill | Swift testing | RxViewModel integration test patterns | HTTPClientSpy, LocalAgentMock refs |
| app-feature-flags | skill | Tooling | plutil/simctl toggle pattern | Bundle ID, simulator ID, plist path |
