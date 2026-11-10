import CallFolder
import Calls
import Foundation
import Testing

@Suite(.timeLimit(.minutes(1)))
struct RecordingIdentityTests {
    @Test func deletingAndRecordingInSameMinuteReusesOnlyTheLocator() async throws {
        try await withComposeFolder { root in
            let maker = CallFolder(callsURL: root, now: { Date(timeIntervalSince1970: 0) }, timeZone: .gmt,
                                   occupiedNames: { [] }, disk: .system)
            let calls = Calls(folder: root, timeZone: .gmt, duration: { _ in 0 }, disk: .system)
            let first = try maker.make()
            let firstCall = try #require(try calls.list().first)
            #expect(firstCall.recording == first.recording)
            #expect(try String(contentsOf: first.url.appendingPathComponent(".recording-id"), encoding: .utf8) == first.recording.uuidString)
            try calls.delete(id: firstCall.id)
            let second = try maker.make()
            let secondCall = try #require(try calls.list().first)
            #expect(second.url == first.url)
            #expect(secondCall.id == firstCall.id)
            #expect(second.recording != first.recording)
            #expect(secondCall.recording == second.recording)
            try calls.rename(id: secondCall.id, title: "Renamed")
            #expect(try calls.list().first?.recording == second.recording)
            let legacy = root.appendingPathComponent("1970.01.01-0001")
            try FileManager.default.createDirectory(at: legacy, withIntermediateDirectories: false)
            #expect(try calls.list().first?.recording == nil)
        }
    }
}
