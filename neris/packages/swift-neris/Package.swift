// swift-tools-version: 6.2

@preconcurrency import PackageDescription

let package = Package(
    name: "swift-neris",
    products: .all,
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
        name: .nerisCLI,
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

// MARK: - Target.Dependency

private extension Target.Dependency {

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
