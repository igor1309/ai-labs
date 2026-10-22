// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "Audelin",
    platforms: [.macOS(.v26)],
    products: [
        .library(name: "GlassLedger", targets: ["GlassLedger"]),
        .library(name: "LiveText", targets: ["LiveText"]),
        .library(name: "PanelUI", targets: ["PanelUI"]),
        .library(name: "ParakeetRecognizer", targets: ["ParakeetRecognizer"]),
        .library(name: "SettingsUI", targets: ["SettingsUI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/FluidInference/FluidAudio.git", exact: "0.17.7"),
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
            name: "ParakeetRecognizer",
            dependencies: [
                "LiveText",
                .product(name: "FluidAudio", package: "FluidAudio"),
            ]
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
            name: "ParakeetRecognizerTests",
            dependencies: ["ParakeetRecognizer"]
        ),
        .testTarget(
            name: "SettingsUITests",
            dependencies: ["SettingsUI"]
        ),
    ]
)
