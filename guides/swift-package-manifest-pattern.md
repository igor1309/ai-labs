# Swift Package Manifest Pattern

**Source:** [Facebook iOS SDK](https://github.com/facebook/facebook-ios-sdk/blob/main/Package.swift)
**Purpose:** Clean, maintainable, type-safe Package.swift using static properties

## Core Technique

Use extensions with static properties instead of inline strings and verbose configurations. This eliminates magic strings, enables type safety, and makes the main Package declaration incredibly readable.

## Pattern

```swift
// swift-tools-version: 6.1
@preconcurrency import PackageDescription

let package = Package(
    name: "swift-ledger",
    platforms: [.iOS(.v12)],
    products: [.core],
    dependencies: [.postgresNIO],
    targets: [.core, .Tests.core]
)

// MARK: - Products

private extension Product {
    static let core = library(name: .core, targets: [.core])
}

// MARK: - Targets

private extension Target {
    static let core = target(name: .core, dependencies: [.postgresNIO])

    enum Tests {
        static let core = testTarget(name: .Tests.core, dependencies: [.core])
    }
}

// MARK: - Target Dependencies

private extension Target.Dependency {
    static let core = byName(name: .core)
    static let postgresNIO = product(name: "PostgresNIO", package: "postgres-nio")
}

// MARK: - String Constants

private extension String {
    static let core = "LedgerCore"

    enum Tests {
        static let core = "LedgerCoreTests"
    }
}

// MARK: - Package Dependencies (Optional - extends the pattern)

private extension Package.Dependency {
    static let postgresNIO = package(
        url: "https://github.com/vapor/postgres-nio.git",
        from: "1.0.0"
    )
}
```

## Key Points

**Use Private Extensions:**
Mark all extensions as `private` to avoid polluting the global namespace.

**Alphabetical Order:**
Keep properties alphabetically ordered both in declarations and usage (products/targets arrays). This matches filesystem order and makes scanning easy.

**Omit Empty Parameters:**
Don't include `dependencies: []` - if there are no dependencies, omit the parameter entirely.

**Swift 6 Concurrency:**
Use `@preconcurrency import PackageDescription` to suppress Sendable warnings. Package.swift is a single-file sequential script, so concurrency safety isn't a concern.

**Nested Enums for Namespacing:**
Use enums without cases (e.g., `Tests`, `Prefixed`) to group related properties logically.

**Dependency Types:**
- `byName()` for internal targets in your package
- `product()` for dependencies from external packages

**Extension Order (from Facebook):**
1. Product
2. Target
3. Target.Dependency
4. LinkerSetting (if needed)
5. String Constants
6. Package.Dependency (optional - extends Facebook's pattern)

**MARK Comments:**
Use `// MARK: -` to clearly separate each extension section.

## Benefits

- **No magic strings** - All strings defined once
- **Type safety** - Compiler catches typos
- **Readability** - Main declaration is self-documenting
- **Refactoring** - Change names in one place
- **Autocomplete** - IDE shows all available options

## When to Use

- Multiple targets or products
- Shared dependencies across targets
- Team collaboration
- Long-term maintenance

Skip for quick experiments or single-target throwaway packages.

## Advanced: Array Grouping for Large Packages

For packages with many targets, group them using array extensions:

```swift
let package = Package(
    name: "my-package",
    products: .core + .features + .services,
    targets: .core + .features + .services
)

private extension Array where Element == Product {
    static let core: Self = [.domain, .shared]
    static let features: Self = [.payments, .auth]
    static let services: Self = [.api, .database]
}

private extension Product {
    static let domain = library(name: .domain, targets: [.domain])
    static let shared = library(name: .shared, targets: [.shared])
    // ...
}
```

This enables clean grouping when managing 50+ targets while maintaining the pattern.

## Real-World Usage

- **Facebook iOS SDK** - 6+ products, dual Swift/Objective-C targets
- **Production codebases** - 100+ targets managed with array grouping technique
