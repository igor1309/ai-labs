// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "AudelinApp",
    platforms: [.macOS(.v26)],
    products: [
        .library(name: "Composer", targets: ["Composer"]),
        .library(name: "SessionRehearsal", targets: ["SessionRehearsal"]),
    ],
    dependencies: [
        .package(path: ".."),
        .package(url: "https://github.com/igor1309/swift-imrx", from: "1.1.0"),
    ],
    targets: [
        .executableTarget(
            name: "Audelin",
            dependencies: [
                "Composer",
                .product(name: "MicrophoneCapture", package: "macos"),
                .product(name: "SystemAudioCapture", package: "macos"),
                .product(name: "ParakeetRecognizer", package: "macos"),
                .product(name: "CoreAudioProcesses", package: "macos"),
                .product(name: "LiveText", package: "macos"),

                .product(name: "Recordings", package: "macos"),
                .product(name: "CallsListUI", package: "macos"),
                .product(name: "CallAudioAccess", package: "macos"),
                .product(name: "CallAudioProbe", package: "macos"),
                .product(name: "Lifecycle", package: "macos"),
                .product(name: "MenuBar", package: "macos"),
                .product(name: "Preferences", package: "macos"),
                .product(name: "PanelUI", package: "macos"),
                .product(name: "Reading", package: "macos"),
                .product(name: "Recording", package: "macos"),
                .product(name: "Session", package: "macos"),
                .product(name: "IMRxObservation", package: "swift-imrx"),
            ]
        ),
        .executableTarget(
            name: "AudelinRehearsal",
            dependencies: [
                "Composer",
                .product(name: "PanelUI", package: "macos"),
                .product(name: "Reading", package: "macos"),
                .product(name: "Recording", package: "macos"),
                .product(name: "Session", package: "macos"),
                "SessionRehearsal",
                .product(name: "IMRxObservation", package: "swift-imrx"),
            ]
        ),
        .target(
            name: "SessionRehearsal",
            dependencies: ["Composer", .product(name: "LiveText", package: "macos"), .product(name: "Preferences", package: "macos")]
        ),
        .target(
            name: "Composer",
            dependencies: [
                .product(name: "IMRxObservation", package: "swift-imrx"),
                .product(name: "Calls", package: "macos"),
                .product(name: "Recordings", package: "macos"),
                .product(name: "CallsListUI", package: "macos"),
                .product(name: "CallAudioAccess", package: "macos"),
                .product(name: "MenuBar", package: "macos"),
                .product(name: "Lifecycle", package: "macos"),
                .product(name: "LiveAudio", package: "macos"),
                .product(name: "RecordedCapture", package: "macos"),
                .product(name: "CallFolder", package: "macos"),
                .product(name: "CallAppProcesses", package: "macos"),
                .product(name: "CoreAudioProcesses", package: "macos"),
                .product(name: "Preferences", package: "macos"),
                .product(name: "Recording", package: "macos"),
                .product(name: "Session", package: "macos"),
                .product(name: "CallText", package: "macos"),
                .product(name: "SideText", package: "macos"),
                .product(name: "FillIn", package: "macos"),
                .product(name: "LiveText", package: "macos"),
                .product(name: "TrackFile", package: "macos"),
                .product(name: "TranscriptFile", package: "macos"),
                .product(name: "TranscriptWriting", package: "macos"),
                .product(name: "Reading", package: "macos"),
                .product(name: "PanelUI", package: "macos"),
                .product(name: "SplitRows", package: "macos"),
            ]
        ),
        .executableTarget(
            name: "SessionCrashWriter",
            dependencies: [
                "Composer",
                "SessionRehearsal",
            ]
        ),
        .testTarget(
            name: "AudelinTests",
            dependencies: ["Audelin", "Composer", .product(name: "BlockingTestWork", package: "macos"), .product(name: "ParakeetRecognizer", package: "macos")]
        ),
        .testTarget(
            name: "ComposerTests",
            dependencies: [
                "Composer", "Audelin",
                .product(name: "CallAudioAccess", package: "macos"),
                .product(name: "Lifecycle", package: "macos"),
                .product(name: "Recording", package: "macos"),
                .product(name: "BlockingTestWork", package: "macos"),
                "SessionRehearsal",
                "SessionCrashWriter",
                .product(name: "IMRxObservation", package: "swift-imrx"),
            ]
        ),
        .testTarget(
            name: "RecordingTests",
            dependencies: [
                .product(name: "Recording", package: "macos"),
                .product(name: "IMRxObservation", package: "swift-imrx"),
            ]
        ),
        .testTarget(
            name: "SessionTests",
            dependencies: [
                .product(name: "Session", package: "macos"),
                .product(name: "IMRxObservation", package: "swift-imrx"),
            ]
        ),
    ]
)
