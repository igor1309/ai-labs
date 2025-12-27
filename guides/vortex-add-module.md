---
date: 2025-11-28
model: codex
description: "Guide to adding new modules to swift-vortex Package.swift using the static property pattern."
---

# Swift Vortex: Adding New Modules

This guide explains how to add new modules to the swift-vortex Package.swift using the static property pattern.

## Overview

The Package.swift file is huge (~6000 lines) - do not read it as a whole. It uses the static property pattern from the swift-package-manifest skill. All module definitions are organized alphabetically.

## Two Scenarios

### A. New Feature Product (new library with multiple targets)
Creating an entirely new feature like `ConsentFeature` or `TransGran`. Follow all steps below.

### B. New Target in Existing Product (sibling to Core/Backend/UI)
Adding a target like `Composition` to an existing product like `UnauthCardOrder`:
- **Skip** steps 1-2 (no new product)
- **Step 2 modification**: Add target to existing product's `targets:` array alphabetically
- **Steps 3-6**: Add under existing MARK comments (no new MARKs)
- **Paths**: Use parent folder, e.g., `Sources/Feature/\(String.unauthCardOrder)/Composition`

## Steps to Add a New Feature Product

### 1. Add to Product Features Array

**Location:** Find `private extension Array where Element == Product` → `static let features: Self`

**Action:** Add your product to the array alphabetically

```swift
static let features: Self = [
    .consentFeature,        // NEW
    .creditCardMVPFeature,
    .notificationCenter,
    // ...
]
```

### 2. Add Product Definition

**Location:** Right after the Array extension, in `private extension Product`

**Action:** Add product definition alphabetically before the next product

```swift
private extension Product {

    static let consentFeature = library(
        name: .consentFeature,
        targets: [
            .consentFeatureCore,
            .consentFeatureUI,
        ]
    )

    static let creditCardMVPFeature = library(
    // ...
```

### 3. Add to Target Features Array

**Location:** Find second `private extension Array where Element == Target` → `static let features: Self`

**Action:** Add all target names alphabetically with comment header

```swift
static let features: Self = [
    // consentFeature
    .consentFeatureCore,
    .consentFeatureCoreTests,
    .consentFeatureUI,
    .consentFeatureUITests,
    // creditCardMVP
    .creditCardMVPAdapters,
    // ...
]
```

### 4. Add Target Definitions

**Location:** In `private extension Target`, add before next alphabetical section

**Action:** Add all target and testTarget definitions with MARK comment

```swift
private extension Target {

    // MARK: - ConsentFeature

    static let consentFeatureCore = target(
        name: .consentFeatureCore,
        dependencies: [
            // external packages
            .combineSchedulers,
            .tagged,
            // internal modules
            .rxViewModel,
            .stateMachines,
        ],
        path: "Sources/Feature/\(String.consentFeature)/Core"
    )
    static let consentFeatureCoreTests = testTarget(
        name: .consentFeatureCoreTests,
        dependencies: [
            // external packages
            .customDump,
            .tagged,
            // internal modules
            .consentFeatureCore,
        ],
        path: "Tests/Feature/\(String.consentFeature)/Core"
    )

    static let consentFeatureUI = target(
        name: .consentFeatureUI,
        dependencies: [
            // internal modules
            .consentFeatureCore,
            .uiPrimitives,
        ],
        path: "Sources/Feature/\(String.consentFeature)/UI"
    )
    static let consentFeatureUITests = testTarget(
        name: .consentFeatureUITests,
        dependencies: [
            // external packages
            .customDump,
            // internal modules
            .consentFeatureUI,
        ],
        path: "Tests/Feature/\(String.consentFeature)/UI"
    )

    // MARK: - CreditCardMVP
    // ...
```

**Notes:**
- Do NOT include `exclude: ["README.md"]` unless you actually create a README.md file
- Use string interpolation in paths: `"Sources/Feature/\(String.consentFeature)/Core"`
- Comment dependencies as `// external packages` and `// internal modules`

### 5. Add Target.Dependency Definitions

**Location:** In `private extension Target.Dependency`, add before next alphabetical section

**Action:** Add dependency definitions with MARK comment

```swift
private extension Target.Dependency {

    // MARK: - ConsentFeature

    static let consentFeatureCore = byName(
        name: .consentFeatureCore
    )

    static let consentFeatureUI = byName(
        name: .consentFeatureUI
    )

    // MARK: - CreditCardMVP
    // ...
```

### 6. Add String Constants

**Location:** In `private extension String`, add before next alphabetical section

**Action:** Add all string constants with MARK comment

```swift
private extension String {

    // MARK: - ConsentFeature

    static let consentFeature = "ConsentFeature"

    static let consentFeatureCore = "ConsentFeatureCore"
    static let consentFeatureCoreTests = "ConsentFeatureCoreTests"

    static let consentFeatureUI = "ConsentFeatureUI"
    static let consentFeatureUITests = "ConsentFeatureUITests"

    // MARK: - CreditCardMVP
    // ...
```

### 7. Create Directory Structure

```bash
mkdir -p Sources/Feature/ConsentFeature/Core
mkdir -p Sources/Feature/ConsentFeature/UI
mkdir -p Tests/Feature/ConsentFeature/Core
mkdir -p Tests/Feature/ConsentFeature/UI
```

### 8. Create Source Files

in Sources: create DeleteMe.swift
```swift
public struct DeleteMe { public init() {} }
```

in Tests: DeleteMeTests.swift

```swift
import <Название модуля = папка из Sources>
import XCTest

final class DeleteMeTests: XCTestCase {

	func test_deleteMe() {
	
		_ = DeleteMe()
		XCTfail()
	}
}
```

## Quick Reference: Finding Locations

Use these grep patterns to find insertion points:

```bash
# Find Product features array
grep -n "static let features: Self = \[" Package.swift | head -1

# Find Target features array
grep -n "static let features: Self = \[" Package.swift | tail -1

# Find Target extension
grep -n "^private extension Target {" Package.swift

# Find Target.Dependency extension
grep -n "^private extension Target.Dependency {" Package.swift

# Find String extension
grep -n "^private extension String {" Package.swift
```

## Common Patterns

### Feature Module (Backend + Core + UI)
```swift
.featureNameBackend,
.featureNameCore,
.featureNameUI,
```

### Feature Module (Core + UI only)
```swift
.featureNameCore,
.featureNameUI,
```

### Feature Module (Adapters + Backend + Core + UI)
```swift
.featureNameAdapters,
.featureNameBackend,
.featureNameCore,
.featureNameUI,
```

## Tips

1. **Always maintain alphabetical order** across all sections
2. **Use MARK comments** for each feature section
3. **Check existing similar modules** (e.g., unauthCardOrder) for dependency patterns
4. **Don't include exclude: ["README.md"]** unless the README exists
5. **Use the swift-package-manifest skill** for guidance on the pattern
6. **Package.swift is ~6000 lines** - use grep/search, don't try to read it all
