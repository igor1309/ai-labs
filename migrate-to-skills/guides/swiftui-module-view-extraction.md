---
date: 2026-05-12
model: gpt-5.5-high
description: "Reusable guide for extracting SwiftUI views into modules using explicit state, event, config, factory, and preview boundaries."
---

# SwiftUI Module View Extraction

## Scope

Use this guide when extracting a SwiftUI view from an app or feature preview into a reusable Swift package module.

The goal is a view module that can be used by different clients without importing feature-specific state machines, app composition types, image assets, colors, fonts, or preview-only scenarios.

## Extraction Criteria

Extract a view when all are true:

- The view has a stable UI responsibility that can be named without the source feature.
- The view can render from plain value state.
- User interactions can be expressed as value events.
- Design details can be injected through config.
- Feature-specific objects can be adapted by the client before reaching the view.
- The extracted API is smaller and clearer than the app-local view tree it replaces.

Delay extraction when the view still owns feature orchestration, observes multiple app models directly, or requires source-feature nouns in its public API.

## Target Shape

Create a small module surface with domain contracts separated from SwiftUI rendering:

- `Domain/ComponentState.swift`: value model describing everything needed to render.
- `Domain/ComponentEvent.swift`: value model describing user intents emitted by the view.
- `View/ComponentView.swift`: renders value state and sends events.
- `View/ComponentConfig.swift`: design system values and copy.
- `View/ComponentFactory.swift`: closures for client-supplied child content, projections, or labels.
- `View/Component+Preview.swift`: preview-only state/config helpers for SwiftUI previews.

Use this directory shape when the module is large enough to benefit from separation:

```text
Sources/<ModuleName>/
  Component/
    Domain/
      ComponentEvent.swift
      ComponentState.swift
    View/
      ComponentView.swift
      ComponentConfig.swift
      ComponentFactory.swift
      Component+Preview.swift
```

For a small component, fewer files are acceptable. Keep the `Domain` and `View` boundary visible in folders or in clearly separated file sections.

## View Rules

Treat the reusable view as a dumb component. Its responsibility is to render the given `State` and provide endpoints for UI interactions through `Event`.

The view receives:

- `state`: the full value snapshot to render
- `event`: the only output channel for UI interactions
- `config`: design system and copy values
- `factory`: client-supplied slots and projections

The view may derive small render-only booleans from `state` when it improves readability. It should not own source state, mutate domain state, start effects, validate business rules, or decide feature workflow transitions.

Shape the boundary like this:

```swift
public struct ComponentView<Item: Identifiable, HeaderContent: View>: View {

    private let state: State
    private let event: (Event) -> Void
    private let config: Config
    private let factory: Factory

    public init(
        state: State,
        event: @escaping (Event) -> Void,
        config: Config,
        factory: Factory
    ) {

        self.state = state
        self.event = event
        self.config = config
        self.factory = factory
    }

    public var body: some View {

        // Render state and emit events.
    }
}

public extension ComponentView {

    typealias State = ComponentState<Item>
    typealias Event = ComponentEvent<Item.ID>
    typealias Config = ComponentConfig
    typealias Factory = ComponentFactory<Item, HeaderContent>
}
```

Expose view-owned aliases for the four public collaborators. This keeps the call order explicit while keeping generic signatures short at the view boundary.

Keep out of the reusable view:

- feature state machines, `Node`, `Binder`, `RxViewModel`, `ObservableObject`, or app composition objects
- network, cache, persistence, logging, analytics, or scheduler dependencies
- source-feature domain models unless the component is intentionally feature-owned
- app asset names, `Image(systemName:)`, app fonts, app colors, and default design values
- production `.preview`, `.prod`, or hidden default config values

The client adapts its observed model into `ComponentState` and maps `ComponentEvent` back into its feature events.

## State Rules

`ComponentState` should describe rendered facts, not source-machine internals.

Prefer:

```swift
public struct ComponentState<Item: Identifiable> {

    public let items: [Item]
    public let mode: Mode
    public let selectedID: Item.ID?

    public init(
        items: [Item],
        mode: Mode,
        selectedID: Item.ID?
    ) {

        self.items = items
        self.mode = mode
        self.selectedID = selectedID
    }
}
```

Use nested enums when they improve rendering clarity:

```swift
public extension ComponentState {

    enum Mode {

        case collapsed
        case expanded
        case confirmingDeletion(Item.ID)
    }
}
```

State must be enough for previews to render every meaningful UI state without live infrastructure.

## Event Rules

`ComponentEvent` should describe user intent at the component boundary:

```swift
public enum ComponentEvent<ID> {

    case toggleExpansion
    case add
    case selectItem(ID)
    case selectItemForDeletion(ID)
    case requestItemDeletion(ID)
    case confirmDeletion
    case cancelDeletion
}
```

Events should avoid source-feature names and reducer implementation details. Name the reusable component intent and object, not the current control or gesture shape. For example, prefer `toggleExpansion` over `tapChevron` when the chevron is only today's affordance for expansion.

## Config Rules

`ComponentConfig` owns all design system and copy values needed by the reusable view.

Include:

- colors
- fonts
- images
- dimensions
- paddings and spacing
- animation values when the component owns the animation
- labels, titles, and button copy that are part of the component UI

Example:

```swift
public struct ComponentConfig {

    let card: Card
    let deletion: Deletion
    let layout: Layout

    public init(
        card: Card,
        deletion: Deletion,
        layout: Layout
    ) {

        self.card = card
        self.deletion = deletion
        self.layout = layout
    }
}
```

Config nested structs should group values by responsibility, not by source feature. Sort fields consistently inside each struct.

Shared module config type definitions should not define `.preview`, `.prod`, hidden defaults, or fallback values. Module-local SwiftUI preview code may define a private `.preview` config for its own state catalogue. Production configs belong in the app composition/config layer.

## Factory Rules

Use `ComponentFactory` for client-provided rendering and projections that would otherwise leak source models into the module:

```swift
public struct ComponentFactory<Item, HeaderContent: View> {

    let makeHeaderContent: () -> HeaderContent
    let makeItemSubtitle: (Item) -> String
    let makeItemTitle: (Item) -> String

    public init(
        makeHeaderContent: @escaping () -> HeaderContent,
        makeItemSubtitle: @escaping (Item) -> String,
        makeItemTitle: @escaping (Item) -> String
    ) {

        self.makeHeaderContent = makeHeaderContent
        self.makeItemSubtitle = makeItemSubtitle
        self.makeItemTitle = makeItemTitle
    }
}
```

Use a factory when the reusable view needs to:

- render a slot supplied by the client
- derive text from a generic item
- customize a small child view without exposing app-specific models
- keep reusable state generic while preserving concise call sites

Avoid factories for behavior that belongs in the component itself. If every caller supplies the same closure, move the behavior into the component or config.

## Preview Rules

Previews should catalogue state, not just one happy path. They may live in the same module view file when that keeps the component easy to inspect.

Cover:

- collapsed or idle
- expanded with empty content
- expanded with content
- selected item
- deletion candidate
- confirmation state
- disabled/loading state when the component supports it
- client-supplied slot variants

Use multiple preview blocks when one state obscures another state, for example when an alert is presented over the view. Use preview-only visual scaffolding such as borders, captions, fixed frames, or debug backgrounds when it makes layout behavior easier to inspect.

Preview helpers should be private and local to the preview region or preview-only files:

```swift
private extension ComponentConfig {

    static let preview = Self(
        // Concrete images/colors/fonts are acceptable in preview-only code.
    )
}

private extension ComponentState where Item == PreviewItem {

    static let expanded = Self(...)
}
```

If a preview app needs the same config from multiple files, use an `internal` extension in that preview app.

The distinction is the boundary: reusable view implementation receives design through `Config`; preview instances may choose concrete assets and styling to make the component inspectable.

## App Integration Rules

The app or feature client owns adaptation:

- Observe app state or feature machines in app/feature code.
- Build `ComponentState` from observed values.
- Map `ComponentEvent` into feature events.
- Supply `ComponentConfig` from app design system configuration.
- Supply `ComponentFactory` closures for source-model projection and slots.

This keeps the reusable module independent from the client’s state management choice.

## Testing Rules

For pure SwiftUI rendering modules, prefer compile checks and focused unit tests for value helpers. Add tests when the component owns logic that can regress:

- event mapping helpers
- state projection helpers
- selection/deletion visibility decisions
- formatting performed by the component
- config factories in app composition code

Use existing XCTest/TDD guides for test naming and helper structure. Keep preview-only scenario helpers out of production tests unless they are the clearest value fixtures.

## Review Checklist

- The public component name is reusable outside the source feature.
- Public state and event types contain UI concepts, not reducer internals.
- The view takes `state`, `event`, `config`, and `factory` explicitly.
- The reusable module does not import app composition or feature-specific state management.
- Design system values are injected through config.
- Production module type definitions have no `.preview`, `.prod`, or hidden default config instances.
- Preview state catalogues cover important modes, split across multiple previews when needed for readability.
- Module-local previews and preview app usage may use concrete images/colors/fonts as injected values.
- Production usage receives config from the app composition/config layer.
- App integration changes and module extraction changes can be committed separately.
