// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "Audelin",
    platforms: [.macOS(.v26)],
    products: [
        .library(name: "GlassLedger", targets: ["GlassLedger"]),
        .library(name: "LiveText", targets: ["LiveText"]),
        .library(name: "PanelUI", targets: ["PanelUI"]),
        .library(name: "SettingsUI", targets: ["SettingsUI"]),
    ],
    targets: [
        .target(
            name: "GlassLedger",
            resources: [.copy("Resources/Fonts")]
        ),
        .target(
            name: "LiveText"
        ),
        .target(
            name: "PanelUI",
            dependencies: ["GlassLedger"]
        ),
        .target(
            name: "SettingsUI",
            dependencies: ["GlassLedger"]
        ),
        .testTarget(
            name: "LiveTextTests",
            dependencies: ["LiveText"]
        ),
        .testTarget(
            name: "PanelUITests",
            dependencies: ["PanelUI"]
        ),
        .testTarget(
            name: "SettingsUITests",
            dependencies: ["SettingsUI"]
        ),
    ]
)
