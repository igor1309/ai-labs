---
model: gpt-5-codex
---

# Feature Module Playbook

This guide covers the steps to introduce a new feature module in a Swift package that follows the static-extension manifest pattern described below. Assume module sources live under `Sources/Feature/<FeatureName>` and tests under `Tests/Feature/<FeatureName>`—substitute `<FeatureName>` with the actual identifier when applying the process.

- **Name Prep**  
  Use a placeholder such as `<FeatureName>` (PascalCase) and reuse it consistently. Derive component names (`<FeatureName>Backend`, `<FeatureName>BackendTests`, etc.) from the placeholder. Folder names must mirror the manifest paths.

- **Manifest – Product Exposure**  
  In `Package.swift`, rely on the shared `.features` array to surface the product. Insert `. <featureName>` in alphabetical order within `private extension Array where Element == Product`.

- **Product Definition**  
  In `private extension Product` add:
  ```swift
  static let <featureName> = library(
      name: .<featureName>,
      targets: [
          .<featureName>Backend,
          // extend with Core/UI targets when available
      ]
  )
  ```
  Keep entries alphabetized and match the shape used by existing features.

- **Targets Array**  
  In `private extension Array where Element == Target` append backend and test targets under a `// <featureName>` comment, maintaining the established grouping order.

- **Target Definitions**  
  Add a `// MARK: - <FeatureName>` section to `private extension Target`:
  ```swift
  static let <featureName>Backend = target(
      name: .<featureName>Backend,
      dependencies: [
          // populate with real dependencies later
      ],
      path: "Sources/Feature/\\(String.<featureName>)/Backend"
  )

  static let <featureName>BackendTests = testTarget(
      name: .<featureName>BackendTests,
      dependencies: [
          .<featureName>Backend,
      ],
      path: "Tests/Feature/\\(String.<featureName>)/Backend"
  )
  ```

- **Target Dependencies**  
  Extend `private extension Target.Dependency` with:
  ```swift
  static let <featureName>Backend = byName(name: .<featureName>Backend)
  ```

- **String Constants**  
  In `private extension String` add:
  ```swift
  static let <featureName> = "<FeatureName>"
  static let <featureName>Backend = "<FeatureName>Backend"
  static let <featureName>BackendTests = "<FeatureName>BackendTests"
  ```
  Keep the section grouped under `// MARK: - <FeatureName>`.

- **Placeholder Sources**  
  Create `Sources/Feature/<FeatureName>/Backend` and `Tests/Feature/<FeatureName>/Backend`. Add:
  ```swift
  // Sources/Feature/<FeatureName>/Backend/DeleteMe.swift
  public struct DeleteMe { public init() {} }
  ```
  ```swift
  // Tests/Feature/<FeatureName>/Backend/DeleteMeTests.swift
  @testable import <FeatureName>Backend
  import XCTest

  final class DeleteMeTests: XCTestCase {
      func test_deleteMe() {
          _ = DeleteMe()
          XCTFail()
      }
  }
  ```
  These placeholders keep the manifest valid until real code ships.

- **Housekeeping**  
  Avoid unused imports, stick to ASCII, and follow repo commenting conventions. Confirm that `Package.swift` additions introduce no duplicate product entries.

- **Validation**  
  Run `swift package describe` or `swift test` (after adjusting the placeholder test to succeed) to ensure the manifest parses. Replace the `DeleteMe` stubs with real implementation as the feature matures.
