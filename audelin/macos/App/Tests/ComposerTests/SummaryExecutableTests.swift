import Foundation
import SummaryRuntime
import Testing
@testable import Composer

@Suite struct SummaryExecutableTests {
    /// Contract test: the native file check rejects directories and nonexecutables, and follows executable symlinks.
    @Test func discoveryAcceptsOnlyExecutableFiles() async throws {
        try await withComposeFolder { root in
            let manager = FileManager.default
            let directory = root.appendingPathComponent("directory/claude")
            let nonexecutable = root.appendingPathComponent("nonexecutable/claude")
            let link = root.appendingPathComponent("linked/claude")
            let target = root.appendingPathComponent("target")
            try manager.createDirectory(at: directory, withIntermediateDirectories: true)
            try manager.createDirectory(at: nonexecutable.deletingLastPathComponent(), withIntermediateDirectories: true)
            try manager.createDirectory(at: link.deletingLastPathComponent(), withIntermediateDirectories: true)
            try Data("fixture".utf8).write(to: nonexecutable)
            try manager.setAttributes([.posixPermissions: 0o600], ofItemAtPath: nonexecutable.path)
            let resolver = summaryExecutable(path: [directory, nonexecutable, link].map { $0.deletingLastPathComponent().path }.joined(separator: ":"), home: root.path)
            // Absolute overrides cannot fall through to a different installed program.
            for path in [directory.path, nonexecutable.path, link.path] {
                #expect(throws: Failure.unavailable) { try resolver.resolve(path) }
            }
            try Data("fixture".utf8).write(to: target)
            try manager.setAttributes([.posixPermissions: 0o700], ofItemAtPath: target.path)
            try manager.createSymbolicLink(at: link, withDestinationURL: target)
            #expect(try resolver.resolve("") == link.path)
            #expect(try resolver.resolve(link.path) == link.path)
        }
    }
}
