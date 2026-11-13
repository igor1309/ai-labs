import BrowserBridge
import Foundation
import Testing

/// The fixtures are shared with the extension's encoder tests: both sides
/// read the same files.
@Suite struct BrowserMessageTests {
    @Test func readsARoster() throws {
        #expect(try decode("valid/roster") == BrowserMessage(callID: "12345678901234", sequence: 0, event: .roster(at: 1_731_499_200_000.5, participants: [
            BrowserParticipant(id: "telemost-tile-1", name: "Анна Петрова", isSelf: true),
            BrowserParticipant(id: "telemost-tile-2", name: "Boris Ivanov", isSelf: false),
        ])))
    }
    @Test func readsAnEmptyRoster() throws {
        #expect(try decode("valid/roster-empty").event == .roster(at: 1_731_499_201_000, participants: []))
    }
    @Test func readsSpeakingStartAndStop() throws {
        #expect(try decode("valid/speaking-started") == BrowserMessage(callID: "12345678901234", sequence: 1, event: .speakingStarted(at: 1_731_499_200_250, participantID: "telemost-tile-2")))
        #expect(try decode("valid/speaking-stopped").event == .speakingStopped(at: 1_731_499_202_750.25, participantID: "telemost-tile-2"))
    }
    @Test func readsTheCallsEnd() throws {
        #expect(try decode("valid/call-ended") == BrowserMessage(callID: "12345678901234", sequence: 4, event: .callEnded(at: 1_731_499_203_000)))
    }
    @Test(arguments: try fixtureNames("invalid"))
    func rejectsAMalformedMessage(_ name: String) throws {
        #expect(throws: BrowserMessageError.self) { try decode("invalid/\(name)") }
    }
    @Test func theSharedFixturesIncludeEveryRejection() throws {
        #expect(try fixtureNames("invalid").count == 16)
    }
}

private func decode(_ name: String) throws -> BrowserMessage {
    try BrowserMessage.decode(Data(contentsOf: try fixtureURL(name)))
}

private func fixtureURL(_ name: String) throws -> URL {
    try #require(Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures/messages"))
}

private func fixtureNames(_ folder: String) throws -> [String] {
    let directory = try #require(Bundle.module.url(forResource: folder, withExtension: nil, subdirectory: "Fixtures/messages"))
    return try FileManager.default.contentsOfDirectory(atPath: directory.path).filter { $0.hasSuffix(".json") }.map { String($0.dropLast(5)) }.sorted()
}
