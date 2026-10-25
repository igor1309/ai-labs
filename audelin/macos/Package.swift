// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "Audelin",
    platforms: [.macOS(.v26)],
    products: [
        .library(name: "CallAppProcesses", targets: ["CallAppProcesses"]),
        .library(name: "CallFolder", targets: ["CallFolder"]),
        .library(name: "CallText", targets: ["CallText"]),
        .library(name: "Compose", targets: ["Compose"]),
        .library(name: "CoreAudioProcesses", targets: ["CoreAudioProcesses"]),
        .library(name: "GlassLedger", targets: ["GlassLedger"]),
        .library(name: "LiveText", targets: ["LiveText"]),
        .library(name: "Machine", targets: ["Machine"]),
        .library(name: "MicrophoneCapture", targets: ["MicrophoneCapture"]),
        .library(name: "NemotronRecognizer", targets: ["NemotronRecognizer"]),
        .library(name: "PanelUI", targets: ["PanelUI"]),
        .library(name: "ParakeetRecognizer", targets: ["ParakeetRecognizer"]),
        .library(name: "Recording", targets: ["Recording"]),
        .library(name: "SettingsUI", targets: ["SettingsUI"]),
        .library(name: "Session", targets: ["Session"]),
        .library(name: "SystemAudioCapture", targets: ["SystemAudioCapture"]),
        .library(name: "TrackFile", targets: ["TrackFile"]),
        .library(name: "TranscriptFile", targets: ["TranscriptFile"]),
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
            name: "CallAppProcesses"
        ),
        .target(
            name: "CallFolder"
        ),
        .target(
            name: "CallText"
        ),
        .target(
            name: "Compose",
            dependencies: ["CallFolder", "CallAppProcesses", "Session", "CallText", "LiveText", "TrackFile", "TranscriptFile", "MicrophoneCapture", "SystemAudioCapture"]
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
            name: "Machine"
        ),
        .target(
            name: "MicrophoneCapture"
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
            name: "Recording",
            dependencies: ["Machine"]
        ),
        .target(
            name: "SettingsUI",
            dependencies: ["GlassLedger"]
        ),
        .target(
            name: "Session",
            dependencies: ["Machine"]
        ),
        .target(
            name: "SystemAudioCapture"
        ),
        .target(
            name: "TrackFile",
            dependencies: ["AudioConversion"]
        ),
        .executableTarget(
            name: "TrackFileCrashWriter",
            dependencies: ["TrackFile"]
        ),
        .target(
            name: "TranscriptFile"
        ),
        .executableTarget(
            name: "TranscriptFileCrashWriter",
            dependencies: ["TranscriptFile"]
        ),
        .target(
            name: "TwoPassRecognizer",
            dependencies: ["LiveText"]
        ),
        .testTarget(
            name: "CallAppProcessesTests",
            dependencies: ["CallAppProcesses"]
        ),
        .testTarget(
            name: "CallFolderTests",
            dependencies: ["CallFolder", "TrackFile", "TranscriptFile"]
        ),
        .testTarget(
            name: "CallTextTests",
            dependencies: ["CallText"]
        ),
        .testTarget(
            name: "ComposeTests",
            dependencies: ["Compose"]
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
            name: "MachineTests",
            dependencies: ["Machine"]
        ),
        .testTarget(
            name: "MicrophoneCaptureTests",
            dependencies: ["MicrophoneCapture"]
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
            name: "RecordingTests",
            dependencies: ["Recording", "Machine"]
        ),
        .testTarget(
            name: "SettingsUITests",
            dependencies: ["SettingsUI"]
        ),
        .testTarget(
            name: "SessionTests",
            dependencies: ["Session", "Machine"]
        ),
        .testTarget(
            name: "SystemAudioCaptureTests",
            dependencies: ["SystemAudioCapture"]
        ),
        .testTarget(
            name: "TrackFileTests",
            dependencies: ["TrackFile", "TrackFileCrashWriter", "AudioConversion"]
        ),
        .testTarget(
            name: "TranscriptFileTests",
            dependencies: ["TranscriptFile", "TranscriptFileCrashWriter"]
        ),
        .testTarget(
            name: "TwoPassRecognizerTests",
            dependencies: ["TwoPassRecognizer"]
        ),
    ]
)
