// swift-tools-version: 6.2

@preconcurrency import PackageDescription

let package = Package(
    name: "swift-neris",
    platforms: [.macOS(.v13)],
    products: .all,
    dependencies: .all,
    targets: .all
)

// MARK: - Products

private extension Array where Element == Product {

    static let all: Self = [
        .nerisCLI,
        .nerisCore,
    ]
}

private extension Product {

    static let nerisCLI = Product.executable(
        name: "neris",
        targets: [
            .nerisCLI,
        ]
    )

    static let nerisCore = Product.library(
        name: .nerisCore,
        targets: [
            .nerisCore,
        ]
    )
}

// MARK: - Targets

private extension Array where Element == Target {

    static let all: Self = [
        .nerisCLI,
        .nerisCore,
        .nerisCoreTests,
    ]
}

private extension Target {

    // MARK: - CLI

    static let nerisCLI = Target.executableTarget(
        name: .nerisCLI,
        dependencies: [
            .argumentParser,
            .nerisCore,
        ],
        path: "Sources/CLI"
    )

    // MARK: - Core

    static let nerisCore = Target.target(
        name: .nerisCore,
        path: "Sources/Core"
    )

    static let nerisCoreTests = Target.testTarget(
        name: .nerisCoreTests,
        dependencies: [
            .nerisCore,
        ],
        path: "Tests/Core"
    )
}

// MARK: - External Dependencies

private extension Array where Element == Package.Dependency {

    static let all: Self = [
        .argumentParser,
    ]
}

private extension Package.Dependency {

    static let argumentParser = Package.Dependency.package(
        url: "https://github.com/apple/swift-argument-parser.git",
        from: "1.5.0"
    )
}

private extension Target.Dependency {

    static let argumentParser = Target.Dependency.product(
        name: "ArgumentParser",
        package: "swift-argument-parser"
    )

    // MARK: - Core

    static let nerisCore = Target.Dependency.byName(
        name: .nerisCore
    )
}

// MARK: - String

private extension String {

    // MARK: - CLI

    static let nerisCLI = "NerisCLI"

    // MARK: - Core

    static let nerisCore = "NerisCore"
    static let nerisCoreTests = "NerisCoreTests"
}
