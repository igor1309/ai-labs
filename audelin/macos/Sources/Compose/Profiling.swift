import struct CallText.State
import LiveText
import os
import Reading

/// A fresh ID for each call keeps overlapping hearings and writes distinct.
struct ProfileIntervals: Sendable {

    let begin: @Sendable (StaticString) -> @Sendable () -> Void

    static let system: Self = {
        let log = OSLog(subsystem: "dev.igor1309.audelin", category: .pointsOfInterest)
        return Self { name in
            let id = OSSignpostID(log: log)
            os_signpost(.begin, log: log, name: name, signpostID: id)
            return { os_signpost(.end, log: log, name: name, signpostID: id) }
        }
    }()
}

struct SignpostedPanelUpdate: Sendable {

    let receive: @Sendable (ReadingState) async -> Void
    let intervals: ProfileIntervals

    func callAsFunction(_ state: ReadingState) async {

        let end = intervals.begin("PanelUpdate")
        defer { end() }
        await receive(state)
    }
}

struct SignpostedTranscriptFile: SessionTranscriptFile {

    let base: any SessionTranscriptFile
    let intervals: ProfileIntervals

    func write(_ state: State) async throws {

        let end = intervals.begin("TranscriptWrite")
        defer { end() }
        try await base.write(state)
    }

    func close() async { await base.close() }
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
