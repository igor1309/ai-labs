// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "audelin-replay",
    platforms: [.macOS(.v26)],
    dependencies: [
        .package(path: "../../../macos"),
    ],
    targets: [
        .executableTarget(
            name: "audelin-replay",
            dependencies: [
                .product(name: "LiveText", package: "macos"),
                .product(name: "NemotronRecognizer", package: "macos"),
                .product(name: "ParakeetRecognizer", package: "macos"),
            ]
        ),
    ]
)
