// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "MizanBLEPreviewApps",
    platforms: [.macOS(.v26)],
    dependencies: [.package(path: "..")],
    targets: [
        .target(name: "PreviewKit"),
        .executableTarget(
            name: "ClientPreview",
            dependencies: [
                "PreviewKit",
                .product(name: "DesignSystem", package: "ios"),
                .product(name: "ClientUI", package: "ios"),
            ]
        ),
        .executableTarget(
            name: "ModeSwitchPreview",
            dependencies: [
                "PreviewKit",
                .product(name: "DesignSystem", package: "ios"),
                .product(name: "ModeSwitchUI", package: "ios"),
            ]
        ),
    ]
)
