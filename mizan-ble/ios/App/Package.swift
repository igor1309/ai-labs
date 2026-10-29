// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "MizanBLEApp",
    platforms: [.iOS(.v26), .macOS(.v26)],
    products: [
        .library(name: "Root", targets: ["Root"]),
        .library(name: "DeviceRadios", targets: ["DeviceRadios"]),
    ],
    dependencies: [
        .package(path: ".."),
        .package(url: "https://github.com/igor1309/swift-imrx.git", from: "1.0.0"),
    ],
    targets: [
        .target(name: "Root", dependencies: [
            .product(name: "IMRxObservation", package: "swift-imrx"),
            .product(name: "AmountEntry", package: "ios"),
            .product(name: "HostBroadcast", package: "ios"),
            .product(name: "HostPayment", package: "ios"),
            .product(name: "HostUI", package: "ios"),
            .product(name: "SettingsUI", package: "ios"),
            .product(name: "Settings", package: "ios"),
            .product(name: "SessionCrypto", package: "ios"),
            .product(name: "MessageCodec", package: "ios"),
            .product(name: "SystemClock", package: "ios"),
            .product(name: "Preferences", package: "ios"),
            .product(name: "ModeSwitchUI", package: "ios"),
            .product(name: "DesignSystem", package: "ios"),
        ]),
        .target(name: "DeviceRadios", dependencies: [
            "Root",
            .product(name: "HostRadio", package: "ios"),
            .product(name: "ClientRadio", package: "ios"),
            .product(name: "SystemClock", package: "ios"),
        ]),
        .executableTarget(name: "RenderAppIcon", dependencies: [
            .product(name: "DesignSystem", package: "ios"),
        ], path: "Tools/RenderAppIcon"),
        .testTarget(name: "RootTests", dependencies: ["Root"]),
    ]
)
