---
model: gpt-5-codex
---

# Feature Module Playbook

This guide covers the steps to introduce a new feature module in a Swift package that follows the static-extension manifest pattern described below. Assume module sources live under `Sources/Feature/<FeatureName>` and tests under `Tests/Feature/<FeatureName>`—substitute `<FeatureName>` with the actual identifier when applying the process.

The playbook is designed for human-in-the-loop execution. The task requestor supplies the exact feature/module name, folder location, and the list of targets that must exist (Backend, Core, UI, etc.). The agent applies those inputs verbatim, does not infer additional targets, and does not author commits; a human developer remains accountable for reconciling the scaffolding with production code.

The placeholder backend test added later intentionally fails via `XCTFail()`. That failure is the acceptance signal: it proves the manifest wiring is live and that the new module is discoverable by the test suite. The human developer must replace the stub implementation and remove the failing assertion before landing changes so CI returns to green.

- **Name Prep**  
  Use the provided feature identifier (e.g., `EU` or `EUFeature`) and reuse it consistently. Derive component names (`<FeatureName>Backend`, `<FeatureName>BackendTests`, etc.) from the placeholder. Folder names must mirror the manifest paths supplied in the task context.

- **Manifest – Product Exposure**
  In `Package.swift`, rely on the shared `.features` array to surface the product. Insert `.<featureName>` in alphabetical order within `private extension Array where Element == Product`.
  **Important:** All sections in the manifest use strict alphabetical ordering. Always insert entries in the correct alphabetical position, never append to the end.

- **Product Definition**
  In `private extension Product`, insert in alphabetical order:
  ```swift
  static let <featureName> = library(
      name: .<featureName>,
      targets: [
          .<featureName>Backend,
          // extend with Core/UI targets when available
      ]
  )
  ```

- **Targets Array**
  In `private extension Array where Element == Target` insert backend and test targets in alphabetical order. Add a `// <featureName>` comment line, followed by the target entries:
  ```swift
  // <featureName>
  .<featureName>Backend,
  .<featureName>BackendTests,
  ```
  Insert this block in alphabetical order by feature name relative to other features (e.g., "EU" would go between "CreditCardMVP" and "NotificationCenter").

- **Target Definitions**
  In `private extension Target`, insert a `// MARK: - <FeatureName>` section in alphabetical order:
  ```swift
  static let <featureName>Backend = target(
      name: .<featureName>Backend,
      dependencies: [
          .remoteServices,
          // .vortexTools,  // add if needed
      ],
      path: "Sources/Feature/\\(String.<featureName>)/Backend"
  )

  static let <featureName>BackendTests = testTarget(
      name: .<featureName>BackendTests,
      dependencies: [
          // external packages
          .customDump,
          // internal modules
          .remoteServices,
          .<featureName>Backend,
      ],
      path: "Tests/Feature/\\(String.<featureName>)/Backend"
  )
  ```
  **Note:** Backend targets always require `.remoteServices`. Add `.vortexTools` if the feature needs utility functions. Backend test targets need `.customDump` (for test assertions), `.remoteServices`, and the backend module being tested.

- **Target Dependencies**
  In `private extension Target.Dependency`, insert a `// MARK: - <FeatureName>` section in alphabetical order:
  ```swift
  // MARK: - <FeatureName>

  static let <featureName>Backend = byName(name: .<featureName>Backend)
  ```

- **String Constants**
  In `private extension String`, insert a `// MARK: - <FeatureName>` section in alphabetical order:
  ```swift
  // MARK: - <FeatureName>

  static let <featureName> = "<FeatureName>"

  static let <featureName>Backend = "<FeatureName>Backend"
  static let <featureName>BackendTests = "<FeatureName>BackendTests"
  ```

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
