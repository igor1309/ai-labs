import Composer
import Foundation
import SessionRehearsal

// A call which keeps saving until its parent kills it.
let root = URL(fileURLWithPath: CommandLine.arguments[1])
private let microphone = Feed(), call = Feed()
let transcript = root.appendingPathComponent("1970.01.01-0000/transcript.md")
var boundary = rehearsalBoundary(
    capturePersistence: .transient,
    microphone: { microphone.started() }, call: { _ in call.started() },
    mine: RehearsalRecognizer(SpeakingRecognizer(name: "mine", sentence: 2, pause: 3, offset: 0)),
    theirs: RehearsalRecognizer(SpeakingRecognizer(name: "theirs", sentence: 2, pause: 3, offset: 2.5)),
    now: { Date(timeIntervalSince1970: 0) }, timeZone: { .gmt },
    sleep: { delay in try await ContinuousClock().sleep(for: delay == .seconds(5) ? .milliseconds(10) : delay) },
    intervals: ProfileIntervals { _ in {} }
)
boundary.log = SavedTranscriptReport(transcript: transcript)
let composition = try await startRehearsal(boundary: boundary, root: root)
let frames = 19_200
while true {
    microphone.yield(.init(samples: .init(repeating: 0.25, count: frames), sampleRate: 48_000))
    call.yield(.init(samples: .init(repeating: -0.25, count: frames), sampleRate: 48_000))
    try await Task.sleep(for: .milliseconds(5))
}

/// Prints each save's final count with the file as read after it. The count is the
/// save's own; a later save only adds final entries after those it counted.
private struct SavedTranscriptReport: LogSink {
    let transcript: URL
    private let reporting = DispatchQueue(label: "audelin.crash-writer.reporting")
    private static let prefix = "transcript saved finalCount="

    func write(_ entry: LogEntry) {
        guard entry.message.hasPrefix(Self.prefix), let count = Int(entry.message.dropFirst(Self.prefix.count)) else { return }
        reporting.async { [transcript] in
            guard let data = try? Data(contentsOf: transcript) else { return }
            try? FileHandle.standardOutput.write(contentsOf: Data("wrote \(count) \(data.base64EncodedString())\n".utf8))
        }
    }
}

private final class Feed: Sendable {
    private let source = AsyncThrowingStream<CaptureBuffer, any Error>.makeStream()
    func started() -> StartedCapture<CaptureBuffer> {
        StartedCapture(stream: source.stream, stop: { self.source.continuation.finish() })
    }
    func yield(_ piece: CaptureBuffer) { source.continuation.yield(piece) }
}
