// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "Audelin",
    platforms: [.macOS(.v26)],
    products: [
        .library(name: "PanelUI", targets: ["PanelUI"]),
    ],
    targets: [
        .target(
            name: "PanelUI",
            resources: [.copy("Resources/Fonts")]
        ),
        .testTarget(
            name: "PanelUITests",
            dependencies: ["PanelUI"]
        ),
    ]
)
