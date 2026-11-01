import Composer
import Foundation
import SessionRehearsal

// A call which keeps saving until its parent kills it.
let root = URL(fileURLWithPath: CommandLine.arguments[1])
private let microphone = Feed(), call = Feed()
let reporting = DispatchQueue(label: "audelin.crash-writer.reporting")
let transcript = root.appendingPathComponent("1970.01.01-0000/transcript.md")
let boundary = rehearsalBoundary(
        capturePersistence: .transient,
    microphone: { microphone.started() }, call: { _ in call.started() },
    mine: RehearsalRecognizer(SpeakingRecognizer(name: "mine", sentence: 2, pause: 3, offset: 0)),
    theirs: RehearsalRecognizer(SpeakingRecognizer(name: "theirs", sentence: 2, pause: 3, offset: 2.5)),
    now: { Date(timeIntervalSince1970: 0) }, timeZone: { .gmt },
    sleep: { delay in try await ContinuousClock().sleep(for: delay == .seconds(5) ? .milliseconds(10) : delay) },
    intervals: ProfileIntervals { name in
        guard String(describing: name) == "TranscriptWrite" else { return {} }
        return {
            reporting.async {
                guard let data = try? Data(contentsOf: transcript), let text = String(data: data, encoding: .utf8) else { return }
                // Each side can still be revising its last entry; report only the settled prefix.
                let count = max(0, text.components(separatedBy: "\n\n**").count - 3)
                try? FileHandle.standardOutput.write(contentsOf: Data("wrote \(count) \(data.base64EncodedString())\n".utf8))
            }
        }
    }
)
let composition = try await startRehearsal(boundary: boundary, root: root)
let frames = 19_200
while true {
    microphone.yield(.init(samples: .init(repeating: 0.25, count: frames), sampleRate: 48_000))
    call.yield(.init(samples: .init(repeating: -0.25, count: frames), sampleRate: 48_000))
    try await Task.sleep(for: .milliseconds(5))
}

private final class Feed: Sendable {
    private let source = AsyncThrowingStream<CaptureBuffer, any Error>.makeStream()
    func started() -> StartedCapture<CaptureBuffer> {
        StartedCapture(stream: source.stream, stop: { self.source.continuation.finish() })
    }
    func yield(_ piece: CaptureBuffer) { source.continuation.yield(piece) }
}
