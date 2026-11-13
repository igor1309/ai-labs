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
        .package(path: "../Vendor/FluidAudio"),
        .package(url: "https://github.com/igor1309/swift-imrx", from: "1.1.0"),
    ],
    targets: [
        .executableTarget(
            name: "Audelin",
            dependencies: [
                .product(name: "GlassLedger", package: "macos"),
                .product(name: "SettingsUI", package: "macos"),
                "Composer",
                .product(name: "FluidAudio", package: "FluidAudio"),
                .product(name: "MicrophoneCapture", package: "macos"),
                .product(name: "SystemAudioCapture", package: "macos"),
                .product(name: "ParakeetRecognizer", package: "macos"),
                .product(name: "CoreAudioProcesses", package: "macos"),
                .product(name: "CoreAudioProcessBinding", package: "macos"),
                .product(name: "CallDiarizer", package: "macos"),
                .product(name: "LiveText", package: "macos"),

                .product(name: "Recordings", package: "macos"),
                .product(name: "CallsListUI", package: "macos"),
                .product(name: "SummaryPreviewUI", package: "macos"),
                .product(name: "BrowserBridge", package: "macos"),
                .product(name: "CallsWindowUI", package: "macos"),
                .product(name: "NotesMarkdown", package: "macos"),
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
                "CallsWindowShell",
            ]
        ),
        .target(
            name: "CallsWindowShell",
            dependencies: [
                "Composer",
                .product(name: "GlassLedger", package: "macos"),
                .product(name: "CallsListUI", package: "macos"),
                .product(name: "CallsWindowUI", package: "macos"),
                .product(name: "SummaryPreviewUI", package: "macos"),
                .product(name: "BrowserBridge", package: "macos"),
            ]
        ),
        .executableTarget(
            name: "AudelinRehearsal",
            dependencies: ["Composer", "SessionRehearsal"]
        ),
        .executableTarget(
            name: "CallsRehearsal",
            dependencies: [
                "Composer", "SessionRehearsal", "CallsWindowShell", "CallsRehearsalSupport",
            ]
        ),
        .target(
            name: "CallsRehearsalSupport",
            dependencies: [
                .product(name: "Preferences", package: "macos"),
                .product(name: "SummaryRuntime", package: "macos"),
            ]
        ),
        .testTarget(
            name: "CallsRehearsalSupportTests",
            dependencies: ["CallsRehearsalSupport"]
        ),
        .target(
            name: "SessionRehearsal",
            dependencies: ["Composer", .product(name: "BrowserBridge", package: "macos"), .product(name: "BleedCleanup", package: "macos"), .product(name: "CallDiarizer", package: "macos"), .product(name: "LiveText", package: "macos"), .product(name: "Preferences", package: "macos")]
        ),
        .target(
            name: "Composer",
            dependencies: [
                .product(name: "BleedCleanup", package: "macos"),
                .product(name: "SummarySettings", package: "macos"),
                .product(name: "SummaryPreviewUI", package: "macos"),
                .product(name: "BrowserBridge", package: "macos"),
                .product(name: "SummaryJobs", package: "macos"),
                .product(name: "CallNotes", package: "macos"),
                .product(name: "SummaryFiles", package: "macos"),
                .product(name: "SummaryRuntime", package: "macos"),
                .product(name: "SpeakerIdentification", package: "macos"),
                .product(name: "SpeakerAttribution", package: "macos"),
                .product(name: "SettingsUI", package: "macos"),

                .product(name: "IMRxObservation", package: "swift-imrx"),
                .product(name: "Calls", package: "macos"),
                .product(name: "CallsSearch", package: "macos"),
                .product(name: "Recordings", package: "macos"),
                .product(name: "CallsListUI", package: "macos"),
                .product(name: "NotesMarkdown", package: "macos"),
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
                .product(name: "TranscriptFormat", package: "macos"),
                .product(name: "TranscriptFile", package: "macos"),
                .product(name: "TranscriptWriting", package: "macos"),
                .product(name: "SavePacing", package: "macos"),
                .product(name: "Reading", package: "macos"),
                .product(name: "PanelUI", package: "macos"),
                .product(name: "SplitRows", package: "macos"),
                .product(name: "CallObservation", package: "macos"),
                .product(name: "SpeakerNaming", package: "macos"),
                .product(name: "ZoomAccessibility", package: "macos"),
                .product(name: "CallDiarizer", package: "macos"),
            ]
        ),
        .testTarget(
            name: "AudelinTests",
            dependencies: ["Audelin", "Composer", .product(name: "BlockingTestWork", package: "macos"), .product(name: "CoreAudioProcesses", package: "macos"), .product(name: "LiveText", package: "macos"), .product(name: "SummaryPreviewUI", package: "macos")]
        ),
        .testTarget(
            name: "CallsWindowShellTests",
            dependencies: [
                "CallsWindowShell", "Composer",
                .product(name: "CallsListUI", package: "macos"),
                .product(name: "CallsWindowUI", package: "macos"),
                .product(name: "SummaryPreviewUI", package: "macos"),
                .product(name: "BrowserBridge", package: "macos"),
            ]
        ),
        .testTarget(
            name: "ComposerTests",
            dependencies: [
                "Composer", "Audelin",
                .product(name: "CallAudioAccess", package: "macos"),
                .product(name: "CallFolder", package: "macos"),
                .product(name: "Calls", package: "macos"),
                .product(name: "Lifecycle", package: "macos"),
                .product(name: "Recording", package: "macos"),
                .product(name: "BlockingTestWork", package: "macos"),
                .product(name: "BrowserBridge", package: "macos"),
                "SessionRehearsal",
                .product(name: "IMRxObservation", package: "swift-imrx"),
            ]
        ),
        .testTarget(
            name: "RecordingTests",
            dependencies: [
                .product(name: "Recording", package: "macos"),
            ]
        ),
        .testTarget(
            name: "SessionTests",
            dependencies: [
                .product(name: "Session", package: "macos"),
            ]
        ),
    ]
)
