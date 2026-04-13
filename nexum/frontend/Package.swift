// swift-tools-version: 6.2

@preconcurrency import PackageDescription

let package = Package(
    name: "nexum-frontend",
    platforms: [.macOS(.v13)],
    products: .all,
    dependencies: .all,
    targets: .all
)

// MARK: - Products

private extension Array where Element == Product {

    static let all: Self = [
        .nexumCore,
        .nexumWeb,
    ]
}

private extension Product {

    static let nexumCore = Product.library(
        name: .nexumCore,
        targets: [
            .nexumCore,
        ]
    )

    static let nexumWeb = Product.executable(
        name: .nexumWeb,
        targets: [
            .nexumWeb,
        ]
    )
}

// MARK: - Targets

private extension Array where Element == Target {

    static let all: Self = [
        .nexumCore,
        .nexumWeb,
        .nexumCoreTests,
    ]
}

private extension Target {

    static let nexumCore = Target.target(
        name: .nexumCore,
        dependencies: [
            .imrxObservationAppleOnly,
        ],
        path: "Sources/NexumCore"
    )

    static let nexumWeb = Target.executableTarget(
        name: .nexumWeb,
        dependencies: [
            .javaScriptKit,
            .nexumCore,
        ],
        path: "Sources/NexumWeb"
    )

    static let nexumCoreTests = Target.testTarget(
        name: .nexumCoreTests,
        dependencies: [
            .concurrencyExtras,
            .nexumCore,
        ],
        path: "Tests/NexumCoreTests"
    )
}

// MARK: - External Dependencies

private extension Array where Element == Package.Dependency {

    static let all: Self = [
        .javaScriptKit,
        .swiftConcurrencyExtras,
        .swiftImrx,
    ]
}

private extension Package.Dependency {

    static let javaScriptKit = Package.Dependency.package(
        url: "https://github.com/swiftwasm/JavaScriptKit.git",
        exact: "0.50.2"
    )

    static let swiftConcurrencyExtras = Package.Dependency.package(
        url: "https://github.com/pointfreeco/swift-concurrency-extras.git",
        from: "1.3.1"
    )

    static let swiftImrx = Package.Dependency.package(
        url: "https://github.com/igor1309/swift-imrx.git",
        branch: "main"
    )

}

// MARK: - Target Dependency

private extension Target.Dependency {

    static let concurrencyExtras = Target.Dependency.product(
        name: "ConcurrencyExtras",
        package: "swift-concurrency-extras"
    )

    static let imrxObservationAppleOnly = Target.Dependency.product(
        name: "IMRxObservation",
        package: "swift-imrx",
        condition: .when(platforms: [.iOS, .macCatalyst, .macOS, .tvOS, .watchOS])
    )

    static let javaScriptKit = Target.Dependency.product(
        name: "JavaScriptKit",
        package: "JavaScriptKit"
    )

    static let nexumCore = Target.Dependency.byName(
        name: .nexumCore
    )
}

// MARK: - String

private extension String {

    static let nexumCore = "NexumCore"
    static let nexumCoreTests = "NexumCoreTests"
    static let nexumWeb = "NexumWeb"
}
