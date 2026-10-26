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
        .library(name: "FillIn", targets: ["FillIn"]),
        .library(name: "GlassLedger", targets: ["GlassLedger"]),
        .library(name: "LiveAudio", targets: ["LiveAudio"]),
        .library(name: "LiveText", targets: ["LiveText"]),
        .library(name: "Machine", targets: ["Machine"]),
        .library(name: "MicrophoneCapture", targets: ["MicrophoneCapture"]),
        .library(name: "NemotronRecognizer", targets: ["NemotronRecognizer"]),
        .library(name: "PanelUI", targets: ["PanelUI"]),
        .library(name: "ParakeetRecognizer", targets: ["ParakeetRecognizer"]),
        .library(name: "Preferences", targets: ["Preferences"]),
        .library(name: "RecordedCapture", targets: ["RecordedCapture"]),
        .library(name: "Recording", targets: ["Recording"]),
        .library(name: "SettingsUI", targets: ["SettingsUI"]),
        .library(name: "Session", targets: ["Session"]),
        .library(name: "SideText", targets: ["SideText"]),
        .library(name: "SystemAudioCapture", targets: ["SystemAudioCapture"]),
        .library(name: "TrackFile", targets: ["TrackFile"]),
        .library(name: "TranscriptFile", targets: ["TranscriptFile"]),
        .library(name: "TranscriptWriting", targets: ["TranscriptWriting"]),
        .library(name: "TwoPassRecognizer", targets: ["TwoPassRecognizer"]),
    ],
    dependencies: [
        .package(url: "https://github.com/FluidInference/FluidAudio.git", exact: "0.17.7"),
    ],
    targets: [
        .executableTarget(
            name: "Audelin",
            dependencies: ["Compose", "Recording", "Preferences"]
        ),
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
            dependencies: ["LiveAudio", "RecordedCapture", "CallFolder", "CallAppProcesses", "CoreAudioProcesses", "Preferences", "Recording", "Session", "CallText", "SideText", "FillIn", "LiveText", "ParakeetRecognizer", "TrackFile", "TranscriptFile", "TranscriptWriting", "MicrophoneCapture", "SystemAudioCapture"]
        ),
        .target(
            name: "CoreAudioProcesses"
        ),
        .target(
            name: "FillIn"
        ),
        .target(
            name: "GlassLedger",
            resources: [.copy("Resources/Fonts")]
        ),
        .target(
            name: "LiveAudio"
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
            name: "Preferences"
        ),
        .target(
            name: "RecordedCapture"
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
            name: "SideText"
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
        .target(
            name: "TranscriptWriting"
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
            name: "FillInTests",
            dependencies: ["FillIn"]
        ),
        .testTarget(
            name: "LiveAudioTests",
            dependencies: ["LiveAudio"]
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
            name: "PreferencesTests",
            dependencies: ["Preferences"]
        ),
        .testTarget(
            name: "RecordedCaptureTests",
            dependencies: ["RecordedCapture"]
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
            name: "SideTextTests",
            dependencies: ["SideText"]
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
            name: "TranscriptWritingTests",
            dependencies: ["TranscriptWriting"]
        ),
        .testTarget(
            name: "TwoPassRecognizerTests",
            dependencies: ["TwoPassRecognizer"]
        ),
    ]
)
