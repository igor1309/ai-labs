// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "Audelin",
    platforms: [.macOS(.v26)],
    products: [
        .library(name: "BlockingTestWork", targets: ["BlockingTestWork"]),
        .library(name: "SplitRows", targets: ["SplitRows"]),
        .library(name: "Lifecycle", targets: ["Lifecycle"]),
        .library(name: "Calls", targets: ["Calls"]),
        .library(name: "Recordings", targets: ["Recordings"]),
        .library(name: "CallsListUI", targets: ["CallsListUI"]),
        .library(name: "CallAudioProbe", targets: ["CallAudioProbe"]),
        .library(name: "CallAudioAccess", targets: ["CallAudioAccess"]),
        .library(name: "CallAppProcesses", targets: ["CallAppProcesses"]),
        .library(name: "CallFolder", targets: ["CallFolder"]),
        .library(name: "CallText", targets: ["CallText"]),
        .library(name: "CoreAudioProcesses", targets: ["CoreAudioProcesses"]),
        .library(name: "FillIn", targets: ["FillIn"]),
        .library(name: "GlassLedger", targets: ["GlassLedger"]),
        .library(name: "LiveAudio", targets: ["LiveAudio"]),
        .library(name: "LiveText", targets: ["LiveText"]),
        .library(name: "MenuBar", targets: ["MenuBar"]),
        .library(name: "MicrophoneCapture", targets: ["MicrophoneCapture"]),
        .library(name: "NemotronRecognizer", targets: ["NemotronRecognizer"]),
        .library(name: "PanelUI", targets: ["PanelUI"]),
        .library(name: "ParakeetRecognizer", targets: ["ParakeetRecognizer"]),
        .library(name: "Preferences", targets: ["Preferences"]),
        .library(name: "RecordedCapture", targets: ["RecordedCapture"]),
        .library(name: "Reading", targets: ["Reading"]),
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
        .testTarget(name: "SourceChecksTests", dependencies: ["BlockingTestWork"]),
        .target(name: "Calls"),
        .target(name: "Recordings"),
        .target(name: "CallsListUI", dependencies: ["GlassLedger"]),
        .testTarget(name: "CallsTests", dependencies: ["Calls", "BlockingTestWork"]),
        .testTarget(name: "RecordingsTests", dependencies: ["Recordings"]),
        .testTarget(name: "CallsListUITests", dependencies: ["CallsListUI"]),
        .target(name: "CallAudioProbe"),
        .target(name: "CallAudioAccess"),
        .testTarget(name: "CallAudioProbeTests", dependencies: ["CallAudioProbe", "BlockingTestWork"]),
        .testTarget(name: "CallAudioAccessTests", dependencies: ["CallAudioAccess"]),
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
            name: "CallText",
            dependencies: ["SplitRows"]
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
            name: "Lifecycle"
        ),
        .target(
            name: "LiveAudio"
        ),
        .target(
            name: "LiveText"
        ),
        .target(
            name: "MenuBar"
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
            dependencies: ["GlassLedger", "SplitRows"]
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
            name: "Reading",
            dependencies: ["SplitRows"]
        ),
        .target(
            name: "SplitRows"
        ),
        .target(
            name: "Recording"
        ),
        .target(
            name: "SettingsUI",
            dependencies: ["GlassLedger"]
        ),
        .target(
            name: "Session"
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
        .target(
            name: "BlockingTestWork",
            path: "Tests/BlockingTestWork"
        ),
        .testTarget(
            name: "BlockingTestWorkTests",
            dependencies: ["BlockingTestWork"]
        ),
        .testTarget(
            name: "CallAppProcessesTests",
            dependencies: ["CallAppProcesses"]
        ),
        .testTarget(
            name: "CallFolderTests",
            dependencies: ["CallFolder", "TrackFile", "TranscriptFile", "BlockingTestWork"]
        ),
        .testTarget(
            name: "CallTextTests",
            dependencies: ["CallText", "SplitRows"]
        ),
        .testTarget(
            name: "CoreAudioProcessesTests",
            dependencies: ["CoreAudioProcesses", "BlockingTestWork"]
        ),
        .testTarget(
            name: "FillInTests",
            dependencies: ["FillIn"]
        ),
        .testTarget(
            name: "LifecycleTests",
            dependencies: ["Lifecycle"]
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
            name: "MenuBarTests",
            dependencies: ["MenuBar"]
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
            dependencies: ["NemotronRecognizer", "BlockingTestWork"]
        ),
        .testTarget(
            name: "PanelUITests",
            dependencies: ["PanelUI"]
        ),
        .testTarget(
            name: "ParakeetRecognizerTests",
            dependencies: ["ParakeetRecognizer", "BlockingTestWork", .product(name: "FluidAudio", package: "FluidAudio")]
        ),
        .testTarget(
            name: "PreferencesTests",
            dependencies: ["Preferences", "BlockingTestWork"]
        ),
        .testTarget(
            name: "RecordedCaptureTests",
            dependencies: ["RecordedCapture"]
        ),
        .testTarget(
            name: "ReadingTests",
            dependencies: ["Reading"]
        ),
        .testTarget(
            name: "SettingsUITests",
            dependencies: ["SettingsUI"]
        ),
        .testTarget(
            name: "SideTextTests",
            dependencies: ["SideText"]
        ),
        .testTarget(
            name: "SystemAudioCaptureTests",
            dependencies: ["SystemAudioCapture", "BlockingTestWork"]
        ),
        .testTarget(
            name: "TrackFileTests",
            dependencies: ["TrackFile", "TrackFileCrashWriter", "AudioConversion", "BlockingTestWork"]
        ),
        .testTarget(
            name: "TranscriptFileTests",
            dependencies: ["TranscriptFile", "TranscriptFileCrashWriter", "BlockingTestWork"]
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
