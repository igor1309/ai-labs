// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "AudelinApp",
    platforms: [.macOS(.v26)],
    dependencies: [
        .package(path: ".."),
        .package(url: "https://github.com/igor1309/swift-imrx", from: "1.1.0"),
    ],
    targets: []
)
