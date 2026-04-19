// swift-tools-version: 6.1
@preconcurrency import PackageDescription

let package = Package(
    name: "notio",
    platforms: [.macOS(.v15)],
    dependencies: [.asyncHTTPClient, .hummingbird, .swiftLog],
    targets: [.notioApp, .notioServer, .notioAppTests]
)

// MARK: - Targets

private extension Target {
    static let notioApp = target(
        name: .notioApp,
        dependencies: [.asyncHTTPClient, .hummingbird, .logging]
    )
    static let notioAppTests = testTarget(
        name: .notioAppTests,
        dependencies: [.notioApp, .hummingbirdTesting]
    )
    static let notioServer = executableTarget(
        name: .notioServer,
        dependencies: [.asyncHTTPClient, .notioApp]
    )
}

// MARK: - Target.Dependency

private extension Target.Dependency {
    static let asyncHTTPClient = product(name: "AsyncHTTPClient", package: "async-http-client")
    static let hummingbird = product(name: "Hummingbird", package: "hummingbird")
    static let hummingbirdTesting = product(name: "HummingbirdTesting", package: "hummingbird")
    static let logging = product(name: "Logging", package: "swift-log")
    static let notioApp = byName(name: .notioApp)
}

// MARK: - String Constants

private extension String {
    static let notioApp = "NotioApp"
    static let notioAppTests = "NotioAppTests"
    static let notioServer = "NotioServer"
}

// MARK: - Package.Dependency

private extension Package.Dependency {
    static let asyncHTTPClient = Package.Dependency.package(url: "https://github.com/swift-server/async-http-client", from: "1.20.0")
    static let hummingbird = Package.Dependency.package(url: "https://github.com/hummingbird-project/hummingbird", from: "2.0.0")
    static let swiftLog = Package.Dependency.package(url: "https://github.com/apple/swift-log", from: "1.0.0")
}
