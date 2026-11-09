import Foundation

struct ClosureLockFinding: Equatable, Sendable, CustomStringConvertible {
    let file: String
    let line: Int

    var description: String { "\(file):\(line): lock stores a function type; wrap the closure in a struct" }
}

// Reads written types only, without resolving aliases; inferred closures such as Mutex(someClosure) are not caught.
func closureLockFindings(in directory: URL) throws -> [ClosureLockFinding] {
    let directory = directory.resolvingSymlinksInPath()
    let manager = FileManager.default
    var traversalError: (any Error)?
    guard let files = manager.enumerator(
        at: directory, includingPropertiesForKeys: [.isRegularFileKey], options: [.skipsHiddenFiles],
        errorHandler: { _, error in traversalError = error; return false }
    ) else { throw CocoaError(.fileReadUnknown) }
    var findings: [ClosureLockFinding] = []
    for case let file as URL in files where file.pathExtension == "swift" {
        guard try file.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile == true else { continue }
        let source = try String(contentsOf: file, encoding: .utf8)
        guard source.contains("Mutex") || source.contains("OSAllocatedUnfairLock") else { continue }
        var lexer = SwiftTypeLexer(bytes: Array(source.utf8))
        let tokens = lexer.tokens()
        for index in tokens.indices where ["Mutex", "OSAllocatedUnfairLock"].contains(tokens[index].text) {
            let start = index + 1
            guard start < tokens.count, tokens[start].text == "<",
                  let end = matchingBracket(in: tokens, at: start),
                  isFunctionType(tokens[(start + 1)..<end]) else { continue }
            let relative = String(file.resolvingSymlinksInPath().path.dropFirst(directory.path.count + 1))
            findings.append(ClosureLockFinding(file: relative, line: tokens[index].line))
        }
    }
    if let traversalError { throw traversalError }
    return findings.sorted { ($0.file, $0.line) < ($1.file, $1.line) }
}

private struct TypeToken {
    let text: String
    let line: Int
}

private let closingBrackets = ["(": ")", "[": "]", "<": ">", "{": "}"]

private func matchingBracket(in tokens: [TypeToken], at start: Int) -> Int? {
    guard let closing = closingBrackets[tokens[start].text] else { return nil }
    var stack = [closing]
    for index in (start + 1)..<tokens.count {
        let text = tokens[index].text
        if let closing = closingBrackets[text] {
            stack.append(closing)
        } else if [")", "]", ">", "}"].contains(text) {
            guard stack.last == text else { return nil }
            stack.removeLast()
            if stack.isEmpty { return index }
        }
    }
    return nil
}

private func isFunctionType(_ slice: ArraySlice<TypeToken>) -> Bool {
    var tokens = Array(slice)
    while !tokens.isEmpty {
        if tokens.last?.text == "?" {
            tokens.removeLast()
            continue
        }
        if tokens.first?.text == "(", matchingBracket(in: tokens, at: 0) == tokens.count - 1 {
            let inner = Array(tokens.dropFirst().dropLast())
            // A tuple can contain closures without storing a bare function.
            if topLevelTokens(inner).contains(where: { [",", ":"].contains($0) }) { return false }
            tokens = inner
            continue
        }
        let optionalStart = tokens.starts(with: ["Swift", ".", "Optional"], by: { $0.text == $1 }) ? 3
            : (tokens.first?.text == "Optional" ? 1 : 0)
        if optionalStart > 0, optionalStart < tokens.count, tokens[optionalStart].text == "<",
           matchingBracket(in: tokens, at: optionalStart) == tokens.count - 1 {
            tokens = Array(tokens[(optionalStart + 1)..<(tokens.count - 1)])
            continue
        }
        return topLevelTokens(tokens).contains("->")
    }
    return false
}

private func topLevelTokens(_ tokens: [TypeToken]) -> [String] {
    var result: [String] = []
    var index = 0
    while index < tokens.count {
        if closingBrackets[tokens[index].text] != nil,
           let end = matchingBracket(in: tokens, at: index) {
            index = end + 1
        } else {
            result.append(tokens[index].text)
            index += 1
        }
    }
    return result
}

private struct SwiftTypeLexer {
    let bytes: [UInt8]
    var index = 0
    var line = 1

    mutating func tokens() -> [TypeToken] {
        var result: [TypeToken] = []
        while index < bytes.count {
            if skipComment() || skipString() { continue }
            let start = index
            let tokenLine = line
            let byte = bytes[index]
            if byte == 32 || byte == 9 || byte == 10 || byte == 13 {
                advance()
                continue
            }
            if isIdentifier(byte) {
                while index < bytes.count, isIdentifier(bytes[index]) { advance() }
            } else if matches([45, 62]) {
                advance(2)
            } else {
                advance()
            }
            result.append(TypeToken(text: String(decoding: bytes[start..<index], as: UTF8.self), line: tokenLine))
        }
        return result
    }

    private func isIdentifier(_ byte: UInt8) -> Bool {
        byte >= 128 || (65...90).contains(byte) || (97...122).contains(byte)
            || (48...57).contains(byte) || byte == 95
    }

    private func matches(_ pattern: [UInt8]) -> Bool {
        bytes[index...].starts(with: pattern)
    }

    private mutating func advance(_ count: Int = 1) {
        for _ in 0..<count where index < bytes.count {
            if bytes[index] == 10 { line += 1 }
            index += 1
        }
    }

    private mutating func skipComment() -> Bool {
        if matches([47, 47]) {
            while index < bytes.count, bytes[index] != 10 { advance() }
            return true
        }
        guard matches([47, 42]) else { return false }
        advance(2)
        var depth = 1
        while index < bytes.count, depth > 0 {
            if matches([47, 42]) { depth += 1; advance(2) }
            else if matches([42, 47]) { depth -= 1; advance(2) }
            else { advance() }
        }
        return true
    }

    private mutating func skipString() -> Bool {
        var quote = index
        while quote < bytes.count, bytes[quote] == 35 { quote += 1 }
        guard quote < bytes.count, bytes[quote] == 34 else { return false }
        let hashes = Array(repeating: UInt8(35), count: quote - index)
        let width = bytes[quote...].starts(with: [34, 34, 34]) ? 3 : 1
        let delimiter = Array(repeating: UInt8(34), count: width) + hashes
        advance(hashes.count + width)
        while index < bytes.count {
            if matches(delimiter) { advance(delimiter.count); return true }
            if matches([92] + hashes) {
                advance(1 + hashes.count)
                if index < bytes.count, bytes[index] == 40 {
                    advance()
                    skipInterpolation()
                } else { advance() }
            } else { advance() }
        }
        return true
    }

    private mutating func skipInterpolation() {
        var depth = 1
        while index < bytes.count, depth > 0 {
            if skipComment() || skipString() { continue }
            if bytes[index] == 40 { depth += 1 }
            if bytes[index] == 41 { depth -= 1 }
            advance()
        }
    }
}
