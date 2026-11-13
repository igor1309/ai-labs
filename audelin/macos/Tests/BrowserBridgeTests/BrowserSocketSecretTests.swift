import BrowserBridge
import Foundation
import Testing

@Suite struct BrowserSocketSecretTests {
    @Test func createsAPrivateSecretTheHelperCanRead() throws {
        try withSecretFolder { path in
            let secret = try BrowserSocketSecret.prepare(at: path)
            #expect(secret.count == BrowserSocketSecret.size)
            #expect(try permissions(path) == 0o600)
            #expect(try BrowserSocketSecret.read(at: path) == secret)
        }
    }

    @Test func keepsTheSecretAcrossLaunches() throws {
        try withSecretFolder { path in
            let first = try BrowserSocketSecret.prepare(at: path)
            #expect(try BrowserSocketSecret.prepare(at: path) == first)
        }
    }

    @Test func replacesASecretOthersCanRead() throws {
        try withSecretFolder { path in
            let loose = try BrowserSocketSecret.prepare(at: path)
            try FileManager.default.setAttributes([.posixPermissions: 0o644], ofItemAtPath: path.path)
            #expect(throws: BrowserSocketSecretFailure.unreadable) { try BrowserSocketSecret.read(at: path) }
            let replaced = try BrowserSocketSecret.prepare(at: path)
            #expect(replaced != loose && replaced.count == BrowserSocketSecret.size)
            #expect(try permissions(path) == 0o600)
        }
    }

    @Test func replacesAFileOfTheWrongSize() throws {
        try withSecretFolder { path in
            try FileManager.default.createDirectory(at: path.deletingLastPathComponent(), withIntermediateDirectories: true)
            FileManager.default.createFile(atPath: path.path, contents: Data("short".utf8), attributes: [.posixPermissions: 0o600])
            #expect(throws: BrowserSocketSecretFailure.unreadable) { try BrowserSocketSecret.read(at: path) }
            #expect(try BrowserSocketSecret.prepare(at: path).count == BrowserSocketSecret.size)
        }
    }

    @Test func theHelperFindsNoSecretBeforeTheAppMadeOne() throws {
        try withSecretFolder { path in
            #expect(throws: BrowserSocketSecretFailure.unreadable) { try BrowserSocketSecret.read(at: path) }
        }
    }
}

private func permissions(_ path: URL) throws -> Int {
    try FileManager.default.attributesOfItem(atPath: path.path)[.posixPermissions] as! Int
}

private func withSecretFolder(_ body: (URL) throws -> Void) throws {
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent("secret-\(UUID())")
    defer { try? FileManager.default.removeItem(at: folder) }
    try body(folder.appendingPathComponent("Audelin/browser.secret"))
}
