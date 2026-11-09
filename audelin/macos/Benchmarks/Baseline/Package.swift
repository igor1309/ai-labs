// swift-tools-version: 6.2
import PackageDescription

// The live transcription baseline: the rehearsal's run over fixture speech and
// real Parakeet, apart so the app and the rehearsal never link the model.
let package = Package(
    name: "AudelinBaseline",
    platforms: [.macOS(.v26)],
    dependencies: [.package(path: "../../App"), .package(path: "../..")],
    targets: [.executableTarget(name: "AudelinBaseline", dependencies: [
        .product(name: "ParakeetRecognizer", package: "macos"),
        .product(name: "SessionRehearsal", package: "App"),
    ])]
)
