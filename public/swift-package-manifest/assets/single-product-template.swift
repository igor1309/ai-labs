// swift-tools-version: 6.1
@preconcurrency import PackageDescription

let package = Package(
    name: "my-library",
    platforms: [.iOS(.v15), .macOS(.v12)],
    products: [.library],
    dependencies: [.swiftArgument],
    targets: [.library, .Tests.library]
)

// MARK: - Products

private extension Product {
    static let library = library(name: .library, targets: [.library])
}

// MARK: - Targets

private extension Target {
    static let library = target(
        name: .library,
        dependencies: [.swiftArgument]
    )
    
    enum Tests {
        static let library = testTarget(
            name: .Tests.library,
            dependencies: [.library]
        )
    }
}

// MARK: - Target Dependencies

private extension Target.Dependency {
    static let library = byName(name: .library)
    static let swiftArgument = product(name: "ArgumentParser", package: "swift-argument-parser")
}

// MARK: - String Constants

private extension String {
    static let library = "MyLibrary"
    
    enum Tests {
        static let library = "MyLibraryTests"
    }
}

// MARK: - Package Dependencies

private extension Package.Dependency {
    static let swiftArgument = package(
        url: "https://github.com/apple/swift-argument-parser.git",
        from: "1.2.0"
    )
}
