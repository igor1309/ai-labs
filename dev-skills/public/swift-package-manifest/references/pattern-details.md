# Swift Package Manifest Pattern - Detailed Reference

## Pattern Origin

Source: Facebook iOS SDK (https://github.com/facebook/facebook-ios-sdk/blob/main/Package.swift)
Purpose: Create maintainable, type-safe Package.swift files that scale from simple to complex packages.

## Complete Pattern Structure

### 1. File Header

```swift
// swift-tools-version: 6.1
@preconcurrency import PackageDescription
```

The `@preconcurrency` annotation suppresses Sendable warnings that are irrelevant for Package.swift files.

### 2. Main Package Declaration

Keep this clean and readable - it should clearly communicate the package structure:

```swift
let package = Package(
    name: "package-name",
    defaultLocalization: "en",
    platforms: [.iOS(.v15), .macOS(.v12)],
    products: [.library1, .library2],
    dependencies: [.external1, .external2],
    targets: [.target1, .target2, .Tests.target1]
)
```

### 3. Extension Organization

#### Product Extensions

```swift
private extension Product {
    static let library1 = library(
        name: .library1,
        targets: [.library1]
    )
    
    static let executable1 = executable(
        name: .executable1,
        targets: [.executable1]
    )
}
```

#### Target Extensions

```swift
private extension Target {
    static let library1 = target(
        name: .library1,
        dependencies: [.dependency1, .dependency2]
    )
    
    static let executable1 = executableTarget(
        name: .executable1,
        dependencies: [.library1]
    )
    
    // Group test targets
    enum Tests {
        static let library1 = testTarget(
            name: .Tests.library1,
            dependencies: [.library1, .testUtilities]
        )
    }
    
    // Group plugin targets
    enum Plugins {
        static let linter = plugin(
            name: .Plugins.linter,
            capability: .buildTool()
        )
    }
}
```

#### Dependency Extensions

```swift
private extension Target.Dependency {
    // Internal targets
    static let library1 = byName(name: .library1)
    static let testUtilities = byName(name: .testUtilities)
    
    // External products
    static let alamofire = product(name: "Alamofire", package: "Alamofire")
    static let swiftFormat = product(name: "SwiftFormat", package: "SwiftFormat")
}
```

#### String Constants

```swift
private extension String {
    static let library1 = "Library1"
    static let executable1 = "Executable1"
    static let testUtilities = "TestUtilities"
    
    enum Tests {
        static let library1 = "Library1Tests"
    }
    
    enum Plugins {
        static let linter = "LinterPlugin"
    }
}
```

#### Package Dependencies

```swift
private extension Package.Dependency {
    static let alamofire = package(
        url: "https://github.com/Alamofire/Alamofire.git",
        from: "5.8.0"
    )
    
    static let swiftFormat = package(
        url: "https://github.com/nicklockwood/SwiftFormat",
        from: "0.52.0"
    )
}
```

## Advanced Patterns

### Array Grouping for Large Packages

When managing 10+ targets, use array concatenation:

```swift
let package = Package(
    name: "large-app",
    products: .core + .features + .utilities,
    targets: .core + .features + .utilities + .tests
)

private extension Array where Element == Product {
    static let core: Self = [.domain, .networking, .storage]
    static let features: Self = [.auth, .payments, .profile]
    static let utilities: Self = [.logging, .analytics]
}

private extension Array where Element == Target {
    static let core: Self = [.domain, .networking, .storage]
    static let features: Self = [.auth, .payments, .profile]
    static let utilities: Self = [.logging, .analytics]
    static let tests: Self = [.Tests.domain, .Tests.networking, .Tests.auth]
}
```

### Conditional Dependencies

For platform-specific dependencies:

```swift
private extension Target {
    static let platformSpecific = target(
        name: .platformSpecific,
        dependencies: {
            var deps: [Target.Dependency] = [.core]
            #if os(iOS)
            deps.append(.iOSOnlyDependency)
            #endif
            return deps
        }()
    )
}
```

### Resource Handling

```swift
private extension Target {
    static let resources = target(
        name: .resources,
        dependencies: [],
        resources: [
            .process("Resources/Images"),
            .copy("Resources/Data")
        ]
    )
}
```

### Binary Targets

```swift
private extension Target {
    static let binaryFramework = binaryTarget(
        name: .binaryFramework,
        url: "https://example.com/framework.zip",
        checksum: "abc123..."
    )
    
    static let localBinary = binaryTarget(
        name: .localBinary,
        path: "Frameworks/LocalFramework.xcframework"
    )
}
```

### Plugin Targets

```swift
private extension Target {
    enum Plugins {
        static let swiftLint = plugin(
            name: .Plugins.swiftLint,
            capability: .buildTool(),
            dependencies: [.swiftLintBinary]
        )
        
        static let codeGen = plugin(
            name: .Plugins.codeGen,
            capability: .command(
                intent: .sourceCodeFormatting(),
                permissions: [.writeToPackageDirectory(reason: "Generate code")]
            )
        )
    }
}
```

## Migration Guide

### Converting Inline Strings

Before:
```swift
.target(
    name: "MyLibrary",
    dependencies: ["Dependency1", "Dependency2"]
)
```

After:
```swift
.target(
    name: .myLibrary,
    dependencies: [.dependency1, .dependency2]
)
```

### Extracting Products

Before:
```swift
products: [
    .library(name: "Library1", targets: ["Library1"]),
    .library(name: "Library2", targets: ["Library2"])
]
```

After:
```swift
products: [.library1, .library2]

// In extension
private extension Product {
    static let library1 = library(name: .library1, targets: [.library1])
    static let library2 = library(name: .library2, targets: [.library2])
}
```

## Common Pitfalls

1. **Forgetting `private`**: Always mark extensions as private
2. **Mixing patterns**: Don't mix inline strings with static properties
3. **Over-nesting**: Keep nesting to 2 levels max (e.g., `Tests.core`)
4. **Circular dependencies**: The pattern makes these more visible
5. **Name collisions**: Use namespacing (enums) to avoid conflicts

## Type Safety Benefits

The pattern enables compile-time checking:

```swift
// ❌ Typo caught at compile time
targets: [.libary1]  // Error: Type 'Target' has no member 'libary1'

// ✅ Correct
targets: [.library1]
```

## Real-World Examples

### Facebook iOS SDK
- 6+ products
- Dual Swift/Objective-C targets
- Complex dependency graph
- Clean 50-line Package declaration

### Vapor Framework
- 20+ targets
- Multiple product types
- Platform-specific code
- Maintained by large team

### Production Apps
- 100+ targets managed with array grouping
- Clear module boundaries
- Easy refactoring
