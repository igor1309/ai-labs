import LiveText
import Reading

/// A fresh ID for each call keeps overlapping hearings and writes distinct.
public struct ProfileIntervals: Sendable {

    public let begin: @Sendable (StaticString) -> @Sendable () -> Void

    public init(begin: @escaping @Sendable (StaticString) -> @Sendable () -> Void) {
        self.begin = begin
    }

}

@MainActor
struct SignpostedPanelUpdate {

    let receive: (ReadingState) -> Void
    let intervals: ProfileIntervals

    func callAsFunction(_ state: ReadingState) {

        let end = intervals.begin("PanelUpdate")
        defer { end() }
        receive(state)
    }
}

struct SignpostedRecognizer: Recognizer {

    let base: any Recognizer
    let intervals: ProfileIntervals

    func hear(_ chunk: AudioChunk) async throws -> Hearing {

        let end = intervals.begin("Hearing")
        defer { end() }
        return try await base.hear(chunk)
    }

    func finish() async throws -> Hearing { try await base.finish() }
}
