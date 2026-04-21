---
date: 2026-04-21
model: claude-opus-4-6
description: "Migration plan for ios.config/.claude skills to dev-skills"
---

# iOS Config Skills Migration

Source: `ios.config/.claude/` (iFora iOS app)
Target: `dev-skills/public/` (ai-labs)

## Move as-is

Generic skills with no repo-specific references.

| Name | Type | Domain | Status |
|------|------|--------|--------|
| testing-schedulers | skill | Swift testing | done |
| rest-contract-review | skill | API design | done |
| ios-simulator-install | skill | Tooling | done |
| debug-print | command | Debugging | done |
| test-runner | non-agent | Testing | done |

## Move with extraction

Reusable patterns embedded in Vortex-specific context. Strategy: extract generic pattern into dev-skills, keep thin repo-level skill that imports/extends with Vortex specifics.

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

## Keep in repo

Too tightly coupled to Vortex types, flows, or domain.

| Name | Type | Domain | Reason |
|------|------|--------|--------|
| add-module | skill | Tooling | Vortex 6000-line Package.swift static-property convention |
| feature-flag | skill | Tooling | FeatureFlags/FeatureFlagKey/CompositionRoot/SceneDelegate wiring |
| completion-with-document-button | skill | UI | DocumentButtonDomain.Model, nanoServiceComposer |
| action-type-flow | skill | Payments | KnownActionType enum, ActionTypeFlowDomain |
| payment-initiation-service-category | skill | Payments | ServiceCategory routing, operator picker |
| standard-payment-operators | skill | Payments | CategorizedStorage, operator caching/paging |
| non-standard-payments | skill | Payments | ServiceCategory.paymentFlow enum routing |
| payment-by-phone-flow | skill | Payments | ContactsViewModel modes, source types |
| latest-payments-flow | skill | Payments | OperationPicker, Latest type routing |
| vortex-swift-package-manifest | skill | Tooling | Moved from dev-skills back to ios.config — Vortex-specific |
