// swift-tools-version: 6.2
import PackageDescription

// The app runs on iOS; macOS is here so the tests run with `swift test`.
let package = Package(
    name: "MizanBLE",
    platforms: [.iOS(.v26), .macOS(.v26)],
    products: [
        .library(name: "DesignSystem", targets: ["DesignSystem"]),
        .library(name: "ModeSwitchUI", targets: ["ModeSwitchUI"]),
        .library(name: "SettingsUI", targets: ["SettingsUI"]),
        .library(name: "Machine", targets: ["Machine"]),
        .library(name: "Settings", targets: ["Settings"]),
        .library(name: "MessageCodec", targets: ["MessageCodec"]),
        .library(name: "SessionCrypto", targets: ["SessionCrypto"]),
    ],
    targets: [
        .target(name: "ModeSwitchUI", dependencies: ["DesignSystem"]),
        .target(name: "SettingsUI", dependencies: ["DesignSystem"]),
        .target(name: "Machine"),
        .testTarget(name: "MachineTests", dependencies: ["Machine"]),
        .target(name: "Settings"),
        .testTarget(name: "SettingsTests", dependencies: ["Settings"]),
        .target(name: "MessageCodec"),
        .testTarget(name: "MessageCodecTests", dependencies: ["MessageCodec"]),
        .target(name: "SessionCrypto"),
        .testTarget(name: "SessionCryptoTests", dependencies: ["SessionCrypto"]),
        .target(
            name: "DesignSystem",
            resources: [.copy("Resources/Fonts")]
        ),
        .testTarget(
            name: "DesignSystemTests",
            dependencies: ["DesignSystem"]
        ),
    ]
)
