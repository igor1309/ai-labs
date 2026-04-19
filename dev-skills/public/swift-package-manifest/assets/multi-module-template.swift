// swift-tools-version: 6.1
@preconcurrency import PackageDescription

let package = Package(
    name: "my-app",
    platforms: [.iOS(.v15), .macOS(.v12)],
    products: .core + .features,
    dependencies: [
        .alamofire,
        .swiftFormat,
        .postgres
    ],
    targets: .core + .features + .shared + .tests
)

// MARK: - Products

private extension Array where Element == Product {
    static let core: Self = [.domain, .networking]
    static let features: Self = [.auth, .payments, .profile]
}

private extension Product {
    static let auth = library(name: .auth, targets: [.auth])
    static let domain = library(name: .domain, targets: [.domain])
    static let networking = library(name: .networking, targets: [.networking])
    static let payments = library(name: .payments, targets: [.payments])
    static let profile = library(name: .profile, targets: [.profile])
}

// MARK: - Targets

private extension Array where Element == Target {
    static let core: Self = [.domain, .networking]
    static let features: Self = [.auth, .payments, .profile]
    static let shared: Self = [.shared, .testUtilities]
    static let tests: Self = [
        .Tests.auth,
        .Tests.domain,
        .Tests.networking,
        .Tests.payments
    ]
}

private extension Target {
    static let auth = target(
        name: .auth,
        dependencies: [.domain, .networking]
    )
    
    static let domain = target(
        name: .domain,
        dependencies: [.postgres, .shared]
    )
    
    static let networking = target(
        name: .networking,
        dependencies: [.alamofire, .shared]
    )
    
    static let payments = target(
        name: .payments,
        dependencies: [.domain, .networking]
    )
    
    static let profile = target(
        name: .profile,
        dependencies: [.domain]
    )
    
    static let shared = target(
        name: .shared,
        dependencies: []
    )
    
    static let testUtilities = target(
        name: .testUtilities,
        dependencies: [.shared]
    )
    
    enum Tests {
        static let auth = testTarget(
            name: .Tests.auth,
            dependencies: [.auth, .testUtilities]
        )
        
        static let domain = testTarget(
            name: .Tests.domain,
            dependencies: [.domain, .testUtilities]
        )
        
        static let networking = testTarget(
            name: .Tests.networking,
            dependencies: [.networking, .testUtilities]
        )
        
        static let payments = testTarget(
            name: .Tests.payments,
            dependencies: [.payments, .testUtilities]
        )
    }
}

// MARK: - Target Dependencies

private extension Target.Dependency {
    // Internal dependencies
    static let auth = byName(name: .auth)
    static let domain = byName(name: .domain)
    static let networking = byName(name: .networking)
    static let payments = byName(name: .payments)
    static let profile = byName(name: .profile)
    static let shared = byName(name: .shared)
    static let testUtilities = byName(name: .testUtilities)
    
    // External dependencies
    static let alamofire = product(name: "Alamofire", package: "Alamofire")
    static let postgres = product(name: "PostgresNIO", package: "postgres-nio")
    static let swiftFormat = product(name: "SwiftFormat", package: "SwiftFormat")
}

// MARK: - String Constants

private extension String {
    static let auth = "Auth"
    static let domain = "Domain"
    static let networking = "Networking"
    static let payments = "Payments"
    static let profile = "Profile"
    static let shared = "Shared"
    static let testUtilities = "TestUtilities"
    
    enum Tests {
        static let auth = "AuthTests"
        static let domain = "DomainTests"
        static let networking = "NetworkingTests"
        static let payments = "PaymentsTests"
    }
}

// MARK: - Package Dependencies

private extension Package.Dependency {
    static let alamofire = package(
        url: "https://github.com/Alamofire/Alamofire.git",
        from: "5.8.0"
    )
    
    static let postgres = package(
        url: "https://github.com/vapor/postgres-nio.git",
        from: "1.19.0"
    )
    
    static let swiftFormat = package(
        url: "https://github.com/nicklockwood/SwiftFormat",
        from: "0.52.0"
    )
}
