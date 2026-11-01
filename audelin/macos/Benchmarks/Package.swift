// swift-tools-version: 6.2
import PackageDescription

// Benchmarks of audelin's real composition, apart from the app's package so
// the app never depends on the benchmark tooling. Run from this directory:
//   swift package benchmark
//   swift package benchmark baseline check --check-absolute-path Thresholds
let package = Package(
    name: "AudelinBenchmarks",
    platforms: [.macOS(.v26)],
    dependencies: [
        .package(path: ".."),
        .package(path: "../App"),
        .package(url: "https://github.com/ordo-one/package-benchmark", exact: "1.38.1"),
    ],
    targets: [
        .executableTarget(
            name: "LateUpdate",
            dependencies: [
                .product(name: "Benchmark", package: "package-benchmark"),
                .product(name: "Composer", package: "App"),
                .product(name: "PanelUI", package: "macos"),
                .product(name: "SessionRehearsal", package: "App"),
            ],
            path: "Benchmarks/LateUpdate",
            plugins: [.plugin(name: "BenchmarkPlugin", package: "package-benchmark")]
        ),
    ]
)
