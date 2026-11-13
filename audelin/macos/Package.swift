// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "Audelin",
    defaultLocalization: "ru",
    platforms: [.macOS(.v26)],
    products: [
        .library(name: "SummarySettings", targets: ["SummarySettings"]),
        .library(name: "SummaryJobs", targets: ["SummaryJobs"]),
        .library(name: "SummaryFiles", targets: ["SummaryFiles"]),
        .library(name: "SummaryRuntime", targets: ["SummaryRuntime"]),
        .library(name: "BleedCleanup", targets: ["BleedCleanup"]),
        .library(name: "SpeakerIdentification", targets: ["SpeakerIdentification"]),
        .library(name: "SpeakerNaming", targets: ["SpeakerNaming"]),
        .library(name: "CallObservation", targets: ["CallObservation"]),
        .library(name: "ZoomAccessibility", targets: ["ZoomAccessibility"]),
        .library(name: "BrowserBridge", targets: ["BrowserBridge"]),
        .library(name: "CallDiarizer", targets: ["CallDiarizer"]),
        .library(name: "SpeakerAttribution", targets: ["SpeakerAttribution"]),

        .library(name: "BlockingTestWork", targets: ["BlockingTestWork"]),
        .library(name: "SplitRows", targets: ["SplitRows"]),
        .library(name: "Lifecycle", targets: ["Lifecycle"]),
        .library(name: "CallNotes", targets: ["CallNotes"]),
        .library(name: "Calls", targets: ["Calls"]),
        .library(name: "Recordings", targets: ["Recordings"]),
        .library(name: "CallsListUI", targets: ["CallsListUI"]),
        .library(name: "CallsSearch", targets: ["CallsSearch"]),
        .library(name: "CallAudioProbe", targets: ["CallAudioProbe"]),
        .library(name: "CallAudioAccess", targets: ["CallAudioAccess"]),
        .library(name: "CallAppProcesses", targets: ["CallAppProcesses"]),
        .library(name: "CallFolder", targets: ["CallFolder"]),
        .library(name: "CallFolderName", targets: ["CallFolderName"]),
        .library(name: "CallText", targets: ["CallText"]),
        .library(name: "CoreAudioProcesses", targets: ["CoreAudioProcesses"]),
        .library(name: "CoreAudioProcessBinding", targets: ["CoreAudioProcessBinding"]),
        .library(name: "FillIn", targets: ["FillIn"]),
        .library(name: "GlassLedger", targets: ["GlassLedger"]),
        .library(name: "NotesMarkdown", targets: ["NotesMarkdown"]),
        .library(name: "SummaryPreviewUI", targets: ["SummaryPreviewUI"]),
        .library(name: "CallsWindowUI", targets: ["CallsWindowUI"]),
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
        .library(name: "TranscriptFormat", targets: ["TranscriptFormat"]),
        .library(name: "TranscriptFile", targets: ["TranscriptFile"]),
        .library(name: "SavePacing", targets: ["SavePacing"]),
        .library(name: "TranscriptWriting", targets: ["TranscriptWriting"]),
        .library(name: "TwoPassRecognizer", targets: ["TwoPassRecognizer"]),
    ],
    dependencies: [
        // Trimmed copy of FluidAudio 0.17.7: audelin/scripts/vendor-fluidaudio.sh.
        .package(path: "Vendor/FluidAudio"),
        // Apache-2.0, with cmark-gfm under BSD-2: notices in audelin/THIRD-PARTY-NOTICES.md.
        .package(url: "https://github.com/swiftlang/swift-markdown.git", from: "0.6.0"),
    ],
    targets: [
        .target(name: "SummarySettings"),
        .testTarget(name: "SummarySettingsTests", dependencies: ["SummarySettings", "BlockingTestWork"]),
        .target(name: "SummaryJobs"),
        .testTarget(name: "SummaryJobsTests", dependencies: ["SummaryJobs", "BlockingTestWork"]),
        .target(name: "SummaryFiles"),
        .testTarget(name: "SummaryFilesTests", dependencies: ["SummaryFiles", "BlockingTestWork"]),
        .target(name: "SummaryRuntime"),
        .testTarget(name: "SummaryRuntimeTests", dependencies: ["SummaryRuntime", "BlockingTestWork"]),
        .target(name: "SpeakerAttribution"),
        .testTarget(name: "SpeakerAttributionTests", dependencies: ["SpeakerAttribution"]),
        .target(name: "BleedCleanup"),
        .testTarget(name: "BleedCleanupTests", dependencies: ["BleedCleanup"]),
        .target(name: "SpeakerIdentification"),
        .testTarget(name: "SpeakerIdentificationTests", dependencies: ["SpeakerIdentification", "BlockingTestWork"]),
        .target(name: "SpeakerNaming"),
        .testTarget(name: "SpeakerNamingTests", dependencies: ["SpeakerNaming"]),
        .target(name: "CallObservation"),
        .testTarget(name: "CallObservationTests", dependencies: ["CallObservation"]),
        .target(name: "ZoomAccessibility"),
        .target(name: "CallDiarizer", dependencies: ["AudioConversion", "ModelLoading", .product(name: "FluidAudio", package: "FluidAudio")]),
        .testTarget(name: "CallDiarizerTests", dependencies: ["CallDiarizer", "BlockingTestWork"]),
        .testTarget(name: "ZoomAccessibilityTests", dependencies: ["ZoomAccessibility"], resources: [.copy("Fixtures")]),
        .target(name: "BrowserBridge", dependencies: ["CallObservation"]),
        .executableTarget(name: "AudelinNativeHost", dependencies: ["BrowserBridge"]),
        .testTarget(name: "BrowserBridgeTests", dependencies: ["BrowserBridge", "CallObservation"], resources: [.copy("Fixtures")]),

        .testTarget(name: "SourceChecksTests", dependencies: ["BlockingTestWork"]),
        .target(name: "Calls", dependencies: ["CallFolderName"]),
        .target(name: "CallsSearch"),
        .target(name: "Recordings"),
        .target(name: "CallsListUI", dependencies: ["GlassLedger"], resources: [.process("Resources")]),
        .target(name: "NotesMarkdown", dependencies: [.product(name: "Markdown", package: "swift-markdown")]),
        .testTarget(name: "NotesMarkdownTests", dependencies: ["NotesMarkdown"]),
        .target(name: "SummaryPreviewUI", dependencies: ["GlassLedger"], resources: [.process("Resources")]),
        .target(name: "CallsWindowUI", dependencies: ["GlassLedger", "NotesMarkdown", "SummaryPreviewUI"]),
        .testTarget(name: "CallsWindowUITests", dependencies: ["CallsWindowUI", "SummaryPreviewUI"]),
        .testTarget(name: "SummaryPreviewUITests", dependencies: ["SummaryPreviewUI", "GlassLedger", "NotesMarkdown", "RenderedText"]),
        .testTarget(name: "CallsSearchTests", dependencies: ["CallsSearch"]),
        .testTarget(name: "CallsTests", dependencies: ["Calls", "TrackFile", "BlockingTestWork"]),
        .testTarget(name: "RecordingsTests", dependencies: ["Recordings"]),
        .testTarget(name: "CallsListUITests", dependencies: ["CallsListUI", "GlassLedger", "RenderedText"]),
        .target(name: "CallAudioProbe"),
        .target(name: "CallAudioAccess"),
        .testTarget(name: "CallAudioProbeTests", dependencies: ["CallAudioProbe", "BlockingTestWork"]),
        .testTarget(name: "AudioConversionTests", dependencies: ["AudioConversion", "BlockingTestWork"]),
        .testTarget(name: "CallAudioAccessTests", dependencies: ["CallAudioAccess"]),
        .target(
            name: "AudioConversion"
        ),
        .target(
            name: "CallAppProcesses"
        ),
        .target(
            name: "CallFolder",
            dependencies: ["CallFolderName"]
        ),
        .target(
            name: "CallFolderName"
        ),
        .target(
            name: "CallText",
            dependencies: ["SplitRows"]
        ),
        .target(
            name: "CoreAudioProcesses"
        ),
        .target(
            name: "CoreAudioProcessBinding",
            dependencies: ["CoreAudioProcesses"]
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
            name: "CallNotes"
        ),
        .target(
            name: "LiveAudio"
        ),
        .target(
            name: "LiveText"
        ),
        .target(
            name: "MenuBar",
            resources: [.process("Resources")]
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
            dependencies: ["GlassLedger", "SplitRows"],
            resources: [.process("Resources")]
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
            dependencies: ["GlassLedger"],
            resources: [.process("Resources")]
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
        .target(name: "SavePacing"),
        .testTarget(name: "SavePacingTests", dependencies: ["SavePacing"]),
        .target(name: "TranscriptFormat"),
        .testTarget(name: "TranscriptFormatTests", dependencies: ["TranscriptFormat"]),
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
            name: "RenderedText",
            path: "Tests/RenderedText"
        ),
        .testTarget(
            name: "GlassLedgerTests",
            dependencies: ["GlassLedger"]
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
            name: "CallFolderNameTests",
            dependencies: ["CallFolderName"]
        ),
        .testTarget(
            name: "CallTextTests",
            dependencies: ["CallText", "SplitRows"]
        ),
        .testTarget(
            name: "CoreAudioProcessesTests",
            dependencies: ["CoreAudioProcesses"]
        ),
        .testTarget(
            name: "CoreAudioProcessBindingTests",
            dependencies: ["CoreAudioProcessBinding", "CoreAudioProcesses", "BlockingTestWork"]
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
            name: "CallNotesTests",
            dependencies: ["CallNotes"]
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
            dependencies: ["MicrophoneCapture", "BlockingTestWork"]
        ),
        .testTarget(
            name: "ModelLoadingTests",
            dependencies: ["ModelLoading", "BlockingTestWork"]
        ),
        .testTarget(
            name: "NemotronRecognizerTests",
            dependencies: ["NemotronRecognizer", "BlockingTestWork", .product(name: "FluidAudio", package: "FluidAudio")]
        ),
        .testTarget(
            name: "PanelUITests",
            dependencies: ["PanelUI", "RenderedText"]
        ),
        .testTarget(
            name: "ParakeetRecognizerTests",
            dependencies: ["ParakeetRecognizer", "BlockingTestWork", .product(name: "FluidAudio", package: "FluidAudio")],
            resources: [.copy("Fixtures")]
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
            dependencies: ["SettingsUI", "RenderedText"]
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
