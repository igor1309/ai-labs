// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "Audelin",
    platforms: [.macOS(.v26)],
    products: [
        .library(name: "CoreAudioProcesses", targets: ["CoreAudioProcesses"]),
        .library(name: "GlassLedger", targets: ["GlassLedger"]),
        .library(name: "LiveText", targets: ["LiveText"]),
        .library(name: "NemotronRecognizer", targets: ["NemotronRecognizer"]),
        .library(name: "PanelUI", targets: ["PanelUI"]),
        .library(name: "ParakeetRecognizer", targets: ["ParakeetRecognizer"]),
        .library(name: "SettingsUI", targets: ["SettingsUI"]),
        .library(name: "TwoPassRecognizer", targets: ["TwoPassRecognizer"]),
    ],
    dependencies: [
        .package(url: "https://github.com/FluidInference/FluidAudio.git", exact: "0.17.7"),
    ],
    targets: [
        .target(
            name: "AudioConversion"
        ),
        .target(
            name: "CoreAudioProcesses"
        ),
        .target(
            name: "GlassLedger",
            resources: [.copy("Resources/Fonts")]
        ),
        .target(
            name: "LiveText"
        ),
        .target(
            name: "ModelLoading"
        ),
        .target(
            name: "NemotronRecognizer",
            dependencies: [
                "AudioConversion",
                "LiveText",
                "ModelLoading",
                .product(name: "FluidAudio", package: "FluidAudio"),
            ]
        ),
        .target(
            name: "PanelUI",
            dependencies: ["GlassLedger"]
        ),
        .target(
            name: "ParakeetRecognizer",
            dependencies: [
                "AudioConversion",
                "LiveText",
                "ModelLoading",
                .product(name: "FluidAudio", package: "FluidAudio"),
            ]
        ),
        .target(
            name: "SettingsUI",
            dependencies: ["GlassLedger"]
        ),
        .target(
            name: "TwoPassRecognizer",
            dependencies: ["LiveText"]
        ),
        .testTarget(
            name: "CoreAudioProcessesTests",
            dependencies: ["CoreAudioProcesses"]
        ),
        .testTarget(
            name: "LiveTextTests",
            dependencies: ["LiveText"]
        ),
        .testTarget(
            name: "ModelLoadingTests",
            dependencies: ["ModelLoading"]
        ),
        .testTarget(
            name: "NemotronRecognizerTests",
            dependencies: ["NemotronRecognizer"]
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
        .testTarget(
            name: "TwoPassRecognizerTests",
            dependencies: ["TwoPassRecognizer"]
        ),
    ]
)
