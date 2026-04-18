// swift-tools-version: 6.1

import PackageDescription

let package = Package(
    name: "notio",
    platforms: [
        .macOS(.v15),
    ],
    dependencies: [
        .package(url: "https://github.com/hummingbird-project/hummingbird", from: "2.0.0"),
        .package(url: "https://github.com/apple/swift-log", from: "1.0.0"),
    ],
    targets: [
        .executableTarget(
            name: "NotioServer",
            dependencies: [
                "NotioApp",
            ]
        ),
        .target(
            name: "NotioApp",
            dependencies: [
                .product(name: "Hummingbird", package: "hummingbird"),
                .product(name: "Logging", package: "swift-log"),
            ]
        ),
        .testTarget(
            name: "NotioAppTests",
            dependencies: [
                "NotioApp",
                .product(name: "HummingbirdTesting", package: "hummingbird"),
            ]
        ),
    ]
)
