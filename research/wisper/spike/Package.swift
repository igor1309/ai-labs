// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "wisper-spike",
    platforms: [.macOS(.v14)],
    dependencies: [
        .package(url: "https://github.com/FluidInference/FluidAudio.git", exact: "0.17.7")
    ],
    targets: [
        .executableTarget(
            name: "wisper-spike",
            dependencies: [.product(name: "FluidAudio", package: "FluidAudio")]
        )
    ]
)
