// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "MizanBLEApp",
    platforms: [.iOS(.v26), .macOS(.v26)],
    products: [
        .library(name: "Root", targets: ["Root"]),
        .library(name: "DeviceRadios", targets: ["DeviceRadios"]),
    ],
    dependencies: [.package(path: "..")],
    targets: [
        .target(name: "Root", dependencies: [
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
