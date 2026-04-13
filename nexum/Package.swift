// swift-tools-version: 6.2

@preconcurrency import PackageDescription

let package = Package(
    name: "nexum",
    platforms: [.macOS(.v15)],
    products: [
        .library(name: "NexumBackend", targets: ["NexumBackend"]),
        .executable(name: "NexumServer", targets: ["NexumServer"]),
    ],
    dependencies: [
        .package(url: "https://github.com/hummingbird-project/hummingbird.git", from: "2.22.0"),
        .package(url: "https://github.com/ptoffy/bcrypt.git", from: "0.3.0"),
        .package(url: "https://github.com/stephencelis/SQLite.swift.git", from: "0.16.0"),
        .package(url: "https://github.com/vapor/jwt-kit.git", from: "5.4.0"),
    ],
    targets: [
        .target(
            name: "NexumBackend",
            dependencies: [
                .product(name: "Bcrypt", package: "bcrypt"),
                .product(name: "Hummingbird", package: "hummingbird"),
                .product(name: "HummingbirdRouter", package: "hummingbird"),
                .product(name: "JWTKit", package: "jwt-kit"),
                .product(name: "SQLite", package: "SQLite.swift"),
            ]
        ),
        .executableTarget(
            name: "NexumServer",
            dependencies: [
                .byName(name: "NexumBackend"),
                .product(name: "Hummingbird", package: "hummingbird"),
                .product(name: "HummingbirdRouter", package: "hummingbird"),
            ]
        ),
        .testTarget(
            name: "NexumBackendTests",
            dependencies: [
                .byName(name: "NexumBackend"),
                .byName(name: "NexumServer"),
                .product(name: "HummingbirdTesting", package: "hummingbird"),
            ]
        ),
    ]
)
