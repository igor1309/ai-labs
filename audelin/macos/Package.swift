// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "Audelin",
    platforms: [.macOS(.v26)],
    products: [
        .library(name: "GlassLedger", targets: ["GlassLedger"]),
        .library(name: "PanelUI", targets: ["PanelUI"]),
    ],
    targets: [
        .target(
            name: "GlassLedger",
            resources: [.copy("Resources/Fonts")]
        ),
        .target(
            name: "PanelUI",
            dependencies: ["GlassLedger"]
        ),
        .testTarget(
            name: "PanelUITests",
            dependencies: ["PanelUI"]
        ),
    ]
)
