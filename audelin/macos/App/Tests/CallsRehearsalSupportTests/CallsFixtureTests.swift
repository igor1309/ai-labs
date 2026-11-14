import CallsRehearsalSupport
import Foundation
import Testing
import TrackFile
import TranscriptFormat

struct CallsFixtureTests {
    @Test func seedOptionWritesTheMergeFixture() async throws {
        try await withRehearsalFolder { root in
            let calls = root.appendingPathComponent("calls")
            let options = try CallsRehearsalOptions.parse(["--calls", calls.path, "--state", root.appendingPathComponent("state").path,
                                                           "--trash", root.appendingPathComponent("trash").path, "--seed", "merge"])
            #expect(options.seed == .merge)
            try await options.seedCalls()
            let names = try FileManager.default.contentsOfDirectory(atPath: calls.path).sorted()
            #expect(names == [CallsFixture.a, CallsFixture.b, CallsFixture.c, CallsFixture.d])
            for id in names {
                let length = try TrackFile.duration(at: calls.appendingPathComponent("\(id)/call.caf"))
                #expect(abs(length - CallsFixture.length) < 0.01)
            }
            for id in [CallsFixture.a, CallsFixture.b] {
                let saved = TranscriptFormat.read(try String(contentsOf: calls.appendingPathComponent("\(id)/transcript.md"), encoding: .utf8))
                #expect(saved.speakers.map(\.id) == ["speaker-1", "speaker-2"])
                #expect(saved.segments.map(\.side) == [.mine, .theirs, .theirs])
                #expect(FileManager.default.fileExists(atPath: calls.appendingPathComponent("\(id)/summary.md").path))
            }
            let d = try FileManager.default.contentsOfDirectory(atPath: calls.appendingPathComponent(CallsFixture.d).path).sorted()
            #expect(d == ["call.caf", "transcript.md"])
            let c = try FileManager.default.contentsOfDirectory(atPath: calls.appendingPathComponent(CallsFixture.c).path)
            #expect(c == ["call.caf"])
        }
    }

    @Test func interruptedMergeLeavesBInsideAPreparedMergeFolder() async throws {
        try await withRehearsalFolder { root in
            let calls = root.appendingPathComponent("calls")
            let options = try CallsRehearsalOptions.parse(["--calls", calls.path, "--state", root.appendingPathComponent("state").path,
                                                           "--trash", root.appendingPathComponent("trash").path, "--seed", "interrupted-merge"])
            try await options.seedCalls()
            let names = try FileManager.default.contentsOfDirectory(atPath: calls.path).sorted()
            let prepared = try #require(names.first { $0.hasPrefix(".audelin-merge-") })
            #expect(names.filter { !$0.hasPrefix(".") } == [CallsFixture.a, CallsFixture.c, CallsFixture.d])
            let inside = try FileManager.default.contentsOfDirectory(atPath: calls.appendingPathComponent(prepared).path).sorted()
            #expect(inside == [CallsFixture.b, "transcript.md"])
        }
    }

    @Test(arguments: [["--seed", "other"], ["--seed"], ["--other", "merge"]])
    func unknownSeedFails(extra: [String]) {
        #expect(throws: CallsRehearsalOptions.Failure.self) {
            try CallsRehearsalOptions.parse(["--calls", "/tmp/calls", "--state", "/tmp/state", "--trash", "/tmp/trash"] + extra)
        }
    }

    @Test func noSeedWritesNoCalls() async throws {
        try await withRehearsalFolder { root in
            let calls = root.appendingPathComponent("calls")
            let options = try CallsRehearsalOptions.parse(["--calls", calls.path, "--state", root.appendingPathComponent("state").path,
                                                           "--trash", root.appendingPathComponent("trash").path])
            #expect(options.seed == nil)
            try await options.seedCalls()
            #expect(!FileManager.default.fileExists(atPath: calls.path))
        }
    }
}
