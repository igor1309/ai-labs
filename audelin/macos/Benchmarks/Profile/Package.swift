// swift-tools-version: 6.2
import PackageDescription
let package = Package(
    name: "AudelinProfile",
    platforms: [.macOS(.v26)],
    dependencies: [.package(path: "../../App"), .package(path: "../..")],
    targets: [.executableTarget(name: "ProfileWord", dependencies: [
        .product(name: "Composer", package: "App"),
        .product(name: "PanelUI", package: "macos"),
        .product(name: "SessionRehearsal", package: "App"),
        .product(name: "TranscriptFile", package: "macos"),
    ])]
)
