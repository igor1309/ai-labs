// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "AudelinPreviewApps",
    platforms: [.macOS(.v26)],
    dependencies: [
        .package(path: ".."),
    ],
    targets: [
        .target(
            name: "PreviewKit"
        ),
        .executableTarget(
            name: "PanelPreview",
            dependencies: [
                "PreviewKit",
                .product(name: "GlassLedger", package: "macos"),
                .product(name: "PanelUI", package: "macos"),
            ]
        ),
        .testTarget(
            name: "PanelPreviewTests",
            dependencies: ["PanelPreview"]
        ),
    ]
)
