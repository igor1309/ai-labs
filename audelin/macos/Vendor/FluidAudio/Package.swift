// swift-tools-version: 6.2
// FluidAudio v0.17.7 (503b4bd1bbf7220882de39fe8ae6716aae4132da), library only, trimmed by
// audelin/scripts/vendor-fluidaudio.sh. Do not edit by hand.
import PackageDescription

let package = Package(
    name: "FluidAudio",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "FluidAudio", targets: ["FluidAudio"]),
    ],
    targets: [
        .target(
            name: "FluidAudio",
            dependencies: ["FastClusterWrapper", "MachTaskSelfWrapper", "NemoTextProcessing"],
            path: "Sources/FluidAudio"
        ),
        .binaryTarget(
            name: "NemoTextProcessing",
            url: "https://github.com/FluidInference/text-processing-rs/releases/download/v0.3.1/NemoTextProcessing.xcframework.zip",
            checksum: "5fa8c10d4ec26c1bb2413125f351a7222a4c68a23b74476680fbada7e26fc6aa"
        ),
        .target(name: "FastClusterWrapper", path: "Sources/FastClusterWrapper", publicHeadersPath: "include"),
        .target(name: "MachTaskSelfWrapper", path: "Sources/MachTaskSelfWrapper", publicHeadersPath: "include"),
    ],
    cxxLanguageStandard: .cxx17
)
