@testable import CallText
@testable import Compose
import LiveText
import Reading
import Synchronization
import Testing

@Suite(.timeLimit(.minutes(1)))
struct ProfilingTests {

    @Test func decoratorsPreserveArgumentsResultsAndErrorsAndEndEveryInterval() async throws {
        for fails in [false, true] {
            let calls = Values<String>()
            let intervals = ProfileIntervals { name in
                let name = String(describing: name)
                calls.append("begin \(name)")
                return { calls.append("end \(name)") }
            }
            let failure = ProfileFailure()
            let hearing = Hearing(words: [.init("word", start: 0, end: 1)])
            let chunk = AudioChunk(samples: [0.25], sampleRate: 48_000)
            let state = State(status: .listening, entries: [])
            let reading = ReadingReducer.reduce(ReadingState(), .recordingChanged(.on(elapsed: 2))).0
            let recognizer = ProfileRecognizer(
                onHear: { value in
                    #expect(value == chunk)
                    calls.append("hear")
                    if fails { throw failure }
                    return hearing
                }, onFinish: { calls.append("finish"); return hearing }
            )
            let file = ProfileFile(onWrite: { value in
                #expect(value == state)
                calls.append("write")
                if fails { throw failure }
            }, onClose: { calls.append("close") })
            let panel = SignpostedPanelUpdate(receive: { value in
                #expect(value == reading)
                calls.append("panel")
            }, intervals: intervals)
            let transcript = SignpostedTranscriptFile(base: file, intervals: intervals)
            let decorated = SignpostedRecognizer(base: recognizer, intervals: intervals)
            await panel(reading)
            do {
                try await transcript.write(state)
                #expect(!fails)
            } catch { #expect(error as? ProfileFailure === failure) }
            do {
                let result = try await decorated.hear(chunk)
                #expect(!fails)
                #expect(result == hearing)
            } catch { #expect(error as? ProfileFailure === failure) }
            #expect(try await decorated.finish() == hearing)
            await transcript.close()
            #expect(calls.all == [
                "begin PanelUpdate", "panel", "end PanelUpdate",
                "begin TranscriptWrite", "write", "end TranscriptWrite",
                "begin Hearing", "hear", "end Hearing", "finish", "close",
            ])
        }
    }
}

private final class ProfileFailure: Error {}

private struct ProfileRecognizer: Recognizer {
    let onHear: @Sendable (AudioChunk) async throws -> Hearing
    let onFinish: @Sendable () async throws -> Hearing
    func hear(_ chunk: AudioChunk) async throws -> Hearing { try await onHear(chunk) }
    func finish() async throws -> Hearing { try await onFinish() }
}

private struct ProfileFile: SessionTranscriptFile {
    let onWrite: @Sendable (State) async throws -> Void
    let onClose: @Sendable () async -> Void
    func write(_ state: State) async throws { try await onWrite(state) }
    func close() async { await onClose() }
}

final class ProfileIntervalSpy: Sendable {

    let began = Values<String>()
    let ended = Values<String>()
    private let running = Mutex<[String: Int]>([:])

    var intervals: ProfileIntervals {
        ProfileIntervals { name in
            let name = String(describing: name)
            self.running.withLock { $0[name, default: 0] += 1 }
            self.began.append(name)
            return {
                self.running.withLock { $0[name, default: 0] -= 1 }
                self.ended.append(name)
            }
        }
    }

    func active(_ name: String) -> Int { running.withLock { $0[name, default: 0] } }
}
