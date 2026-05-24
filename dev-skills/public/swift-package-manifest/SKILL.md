---
name: swift-package-manifest
author: Igor Malyarov
description: Clean, maintainable Package.swift creation and editing using the static property pattern from Facebook iOS SDK. Use when creating new Package.swift files, refactoring existing ones, adding modules/targets to Swift packages, or organizing Swift Package Manager manifests for better maintainability.
version: "1.0.1"
---

# Swift Package Manifest

Create and edit Package.swift files using the clean static property pattern that eliminates magic strings and improves maintainability.

**Announce:** "I'm using the Swift Package Manifest skill to apply the static property pattern."

## Core Pattern

Transform verbose, string-heavy Package.swift files into clean, type-safe manifests using extensions with static properties.

### When to Apply

- Creating new Package.swift files
- Refactoring existing package manifests  
- Adding new modules or targets to packages
- Organizing dependencies across multiple targets
- Team collaboration on Swift packages

## Implementation Steps

### 1. Start with Clean Declaration

Place the main Package declaration at the top, using static properties:

```swift
// swift-tools-version: 6.1
@preconcurrency import PackageDescription

let package = Package(
    name: "package-name",
    platforms: [.iOS(.v15)],
    products: [.core],
    dependencies: [.externalDep],
    targets: [.core, .tests]
)
```

### 2. Define Extensions in Order

Follow this extension order (use `// MARK: -` comments):

1. **Products** - Library and executable definitions
2. **Targets** - Target and test target definitions  
3. **Target.Dependency** - Internal and external dependencies
4. **String Constants** - All string literals
5. **Package.Dependency** (optional) - External package URLs

### 3. Adding New Modules

To add a new module like `ThisFeature`:

```swift
// Add to Products
private extension Product {
    static let thisFeature = library(name: .thisFeature, targets: [.thisFeature])
}

// Add to Targets
private extension Target {
    static let thisFeature = target(name: .thisFeature, dependencies: [.core])
}

// Add to Target.Dependency (if needed by other targets)
private extension Target.Dependency {
    static let thisFeature = byName(name: .thisFeature)
}

// Add to String Constants
private extension String {
    static let thisFeature = "ThisFeature"
}

// Update main declaration
products: [.core, .thisFeature]
targets: [.core, .thisFeature, .tests]
```

## Key Rules

- **Private Extensions**: Always mark extensions as `private`
- **Alphabetical Order**: Keep properties alphabetically ordered
- **Omit Empty Arrays**: Don't include `dependencies: []` if empty
- **Swift 6**: Use `@preconcurrency import PackageDescription`
- **Dependency Types**: 
  - `byName()` for internal targets
  - `product()` for external packages

## Known Pitfall: `Package.Dependency` circular reference

Inside `private extension Package.Dependency`, calling `package(url:from:)` causes a **circular reference** compiler error because Swift resolves `package` as the global `let package = Package(...)` variable rather than the static factory method.

**Fix:** use fully-qualified `Package.Dependency.package(url:from:)`:

```swift
// ❌ Circular reference — `package` resolves to the global `let package`
private extension Package.Dependency {
    static let alamofire = package(url: "https://...", from: "5.8.0")
}

// ✅ Correct — explicit type qualification forces static method resolution
private extension Package.Dependency {
    static let alamofire = Package.Dependency.package(url: "https://...", from: "5.8.0")
}
```

This applies to all `Package.Dependency` factory variants: `package(url:from:)`, `package(url:exact:)`, `package(path:)`, etc.

## Templates

### Single Product Package

See `assets/single-product-template.swift` for a complete example.

### Multi-Module Package  

See `assets/multi-module-template.swift` for organizing multiple targets.

### Large Package with Grouping

For 10+ targets, use array grouping:

```swift
let package = Package(
    name: "my-app",
    products: .core + .features,
    targets: .core + .features + .tests
)

private extension Array where Element == Product {
    static let core: Self = [.domain, .shared]
    static let features: Self = [.auth, .payments]
}
```

## Common Scenarios

### Converting Existing Package.swift

1. Extract all string literals to String extension
2. Create Target extensions for each target
3. Create Product extensions for each product
4. Replace inline definitions with static properties
5. Organize alphabetically

### Adding External Dependencies

```swift
// In Package dependencies
dependencies: [.alamofire, .swiftLint]

// In Target dependencies  
dependencies: [.alamofire]

// Define in extensions
private extension Target.Dependency {
    static let alamofire = product(name: "Alamofire", package: "Alamofire")
}

private extension Package.Dependency {
    static let alamofire = package(
        url: "https://github.com/Alamofire/Alamofire.git",
        from: "5.8.0"
    )
}
```

### Test Targets

Group test targets under a nested enum:

```swift
private extension Target {
    enum Tests {
        static let core = testTarget(name: .Tests.core, dependencies: [.core])
        static let feature = testTarget(name: .Tests.feature, dependencies: [.thisFeature])
    }
}

private extension String {
    enum Tests {
        static let core = "CoreTests"
        static let feature = "ThisFeatureTests"
    }
}
```

## Reference

For complete pattern documentation and advanced techniques, see `references/pattern-details.md`.
