// swift-tools-version: 6.2

@preconcurrency import PackageDescription

let package = Package(
    name: "foliotell",
    platforms: [
        .iOS(.v26),
        .macOS(.v15),
    ],
    products: [
        .library(name: .folioTellCore, targets: [.folioTellCore]),
        .executable(name: .folioTell, targets: [.folioTellApp]),
    ],
    targets: [
        .target(name: .folioTellCore, path: "Sources/Core"),
        .executableTarget(
            name: .folioTellApp,
            dependencies: [
                .folioTellCore,
            ],
            path: "Sources/App",
            resources: [
                .process("Resources"),
            ]
        ),
        .testTarget(
            name: .folioTellCoreTests,
            dependencies: [
                .folioTellCore,
            ],
            path: "Tests/Core"
        ),
    ]
)

private extension Target.Dependency {

    static let folioTellCore = Target.Dependency.byName(name: .folioTellCore)
}

private extension String {

    static let folioTell = "FolioTell"
    static let folioTellApp = "FolioTellApp"
    static let folioTellCore = "FolioTellCore"
    static let folioTellCoreTests = "FolioTellCoreTests"
}
