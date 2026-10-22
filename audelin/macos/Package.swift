// swift-tools-version: 6.0
import PackageDescription

// ADR-001 module layout: one local package plus a thin app target.
let package = Package(
    name: "Audelin",
    platforms: [.macOS(.v14)],
    targets: [
        // Domain: Foundation only, depends on nothing of ours.
        .target(name: "CallDomain"),
        .testTarget(name: "CallDomainTests", dependencies: ["CallDomain"]),
        .target(name: "TranscriptCore"),
        .testTarget(name: "TranscriptCoreTests", dependencies: ["TranscriptCore"]),
    ]
)
