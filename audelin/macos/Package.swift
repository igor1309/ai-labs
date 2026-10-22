// swift-tools-version: 6.0
import PackageDescription

// ADR-001 module layout: one local package plus a thin app target.
let package = Package(
    name: "Audelin",
    platforms: [.macOS(.v14)],
    products: [.executable(name: "Audelin", targets: ["Audelin"])],
    targets: [
        // App: the entry point and composition root; the only target that
        // may depend on every module and create adapters.
        .executableTarget(name: "Audelin"),
        .testTarget(name: "AudelinTests", dependencies: ["Audelin"]),

        // Domain: Foundation only, depends on nothing of ours.
        .target(name: "CallDomain"),
        .testTarget(name: "CallDomainTests", dependencies: ["CallDomain"]),
        .target(name: "TranscriptCore"),
        .testTarget(name: "TranscriptCoreTests", dependencies: ["TranscriptCore"]),

        // Features: a Core depends on Domain only.
        .target(name: "LiveSessionCore", dependencies: ["CallDomain"]),
        .testTarget(name: "LiveSessionCoreTests", dependencies: ["LiveSessionCore"]),
        .target(name: "CallsCore", dependencies: ["CallDomain"]),
        .testTarget(name: "CallsCoreTests", dependencies: ["CallsCore"]),

        // Adapters: Domain and the Core whose ports they implement.
        .target(name: "Recorder", dependencies: ["CallDomain", "LiveSessionCore"]),
        .testTarget(
            name: "RecorderTests",
            dependencies: ["Recorder", "RecorderTestSupport", "recorder-crash-child"]),
        // The recorder's tests: a call-files double and a process to kill.
        .target(name: "RecorderTestSupport", dependencies: ["CallDomain", "LiveSessionCore"]),
        .executableTarget(
            name: "recorder-crash-child",
            dependencies: ["CallDomain", "Recorder", "RecorderTestSupport"]),
        .target(name: "FileCallStore", dependencies: ["CallDomain", "CallsCore"]),
        .testTarget(name: "FileCallStoreTests", dependencies: ["FileCallStore"]),
    ]
)
