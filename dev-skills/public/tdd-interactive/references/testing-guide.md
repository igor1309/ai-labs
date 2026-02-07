# Testing Guide for TDD Interactive

This guide provides language and framework-specific commands for running tests during the TDD Interactive workflow.

## Swift

### Swift Package Manager
```bash
swift test
```

Run specific test:
```bash
swift test --filter <TestClassName>.<testMethodName>
```

### Xcode Projects
```bash
xcodebuild test -scheme <YourScheme> -destination 'platform=iOS Simulator,name=iPhone 15'
```

With quiet output:
```bash
xcodebuild test -scheme <YourScheme> -destination 'platform=iOS Simulator,name=iPhone 15' -quiet
```

## JavaScript/TypeScript

### npm
```bash
npm test
```

### Jest
```bash
npx jest
```

Run specific test file:
```bash
npx jest path/to/test.spec.js
```

### Vitest
```bash
npx vitest
```

Run once (non-watch mode):
```bash
npx vitest run
```

### Node.js built-in test runner
```bash
node --test
```

## Python

### pytest
```bash
pytest
```

Run specific test:
```bash
pytest tests/test_module.py::test_function
```

Verbose output:
```bash
pytest -v
```

### unittest
```bash
python -m unittest
```

Run specific test module:
```bash
python -m unittest tests.test_module
```

## Rust

### Cargo
```bash
cargo test
```

Run specific test:
```bash
cargo test test_name
```

Show output from passing tests:
```bash
cargo test -- --show-output
```

## Go

### go test
```bash
go test
```

Run tests in all packages:
```bash
go test ./...
```

Verbose output:
```bash
go test -v
```

Run specific test:
```bash
go test -run TestFunctionName
```

## Java

### Maven
```bash
mvn test
```

### Gradle
```bash
./gradlew test
```

## Ruby

### RSpec
```bash
rspec
```

Run specific test file:
```bash
rspec spec/models/user_spec.rb
```

### Minitest
```bash
ruby -Itest test/test_*.rb
```

Or with rake:
```bash
rake test
```

## PHP

### PHPUnit
```bash
./vendor/bin/phpunit
```

Run specific test:
```bash
./vendor/bin/phpunit tests/SomeTest.php
```

## .NET/C#

### dotnet test
```bash
dotnet test
```

Run specific test:
```bash
dotnet test --filter FullyQualifiedName~TestMethodName
```

## General Principles

- **Always run the full test suite** to catch regressions
- Use verbose/detailed output when you need to see failure messages
- Most frameworks support running specific tests during development
- Check your project's documentation for custom test scripts or configurations
