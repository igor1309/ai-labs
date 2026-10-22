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
        .executableTarget(
            name: "LiveTextPreview",
            dependencies: [
                "PreviewKit",
                .product(name: "GlassLedger", package: "macos"),
                .product(name: "LiveText", package: "macos"),
                .product(name: "NemotronRecognizer", package: "macos"),
                .product(name: "PanelUI", package: "macos"),
                .product(name: "ParakeetRecognizer", package: "macos"),
                .product(name: "TwoPassRecognizer", package: "macos"),
            ]
        ),
        .testTarget(
            name: "LiveTextPreviewTests",
            dependencies: ["LiveTextPreview"]
        ),
        .testTarget(
            name: "PanelPreviewTests",
            dependencies: ["PanelPreview"]
        ),
    ]
)
