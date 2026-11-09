// swift-tools-version: 6.2
import PackageDescription
let package = Package(
    name: "AudelinSpeech",
    platforms: [.macOS(.v26)],
    dependencies: [.package(path: "../../App"), .package(path: "../..")],
    targets: [.executableTarget(name: "ProfileSpeech", dependencies: [
        .product(name: "Composer", package: "App"),
        .product(name: "LiveText", package: "macos"),
        .product(name: "PanelUI", package: "macos"),
        .product(name: "ParakeetRecognizer", package: "macos"),
        .product(name: "SessionRehearsal", package: "App"),
    ])]
)
