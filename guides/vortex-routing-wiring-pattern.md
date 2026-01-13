---
date: 2026-01-13
model: gpt-5.2
description: "Patterns for wiring routing flows in Vortex"
---

# Vortex Routing Wiring Pattern

## Purpose

Define the expected wiring pattern for routing flows in the main app, including context creation, initiation, view rendering, and test projections.

## Composition Rules

- Keep `RoutingDomain.Content` **non‑equatable** when it stores non‑equatable fields; do not add custom `==` that ignores fields.
- Build contexts in `RootViewModelFactory` (composition), not in view code.
- Keep context factories **pure** (no initial selection or side effects inside them).
- Trigger initial selection in the **use‑case layer** that creates routing (after the binder exists), not inside the context factory or the view (e.g., `routing.initiate(with: payload)`).
- View layer uses `ViewComponents.withObservation(...)` when inside `ViewComponents` (avoid direct `RxWrapperView`).

## Context Factory Pattern

- Map external models via small helpers (e.g., `ModelData.domainModel`).
- Extract options via a small helper on the options result (e.g., `OptionsResult.options`).
- Build UI elements from `snapshot.options(...)` inside the factory closure.
- Use `schedulers.main` for UI‑bound context factories.

## View Rendering Pattern

- Pull context from `binder.content.context`.
- Render UI elements from `context.uiContainer`.
- Drive primary action state from the context state (e.g., `status == .completed`).
- Keep alerts scoped to context state (e.g., confirmation + failure cases).

## Testing Pattern

- Use equatable projections in tests (see existing `EquatableNavigation` / `EquatableSelect` patterns).
- Centralize projection helpers in a shared test base.
- Compare projected values in tests instead of forcing model conformance.

## Anti‑Patterns (Avoid)

- Adding `Equatable` to models with non‑equatable fields and ignoring them in custom `==`.
- Creating context inside views or preview‑only helpers.
- Injecting app‑specific dependencies into `ViewComponents` when only needed by a single feature.
