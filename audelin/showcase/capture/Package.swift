// swift-tools-version: 6.2
import PackageDescription
let package = Package(name: "ShowcaseCapture", platforms: [.macOS(.v26)], dependencies: [.package(path: "../../macos")], targets: [.executableTarget(name: "Capture", dependencies: [.product(name: "PanelUI", package: "macos"), .product(name: "GlassLedger", package: "macos")])])
