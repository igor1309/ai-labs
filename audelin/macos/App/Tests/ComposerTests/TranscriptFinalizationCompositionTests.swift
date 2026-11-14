import CallDiarizer
import Foundation
import LiveText
import PanelUI
import Preferences
import SummaryRuntime
import Testing
@testable import Composer

@Suite(.timeLimit(.minutes(1)))
struct TranscriptFinalizationCompositionTests {
    @MainActor @Test
    func stoppedSessionReceivesSpeakersWhileCleanupWaitsAndNotesTakeTheSavedFinalForm() async throws {
        try await withComposeFolder { root in
            let diarizing = Signal(), attribute = Signal(), cleaning = Signal(), clean = Signal(), deadline = Signal()
            defer { diarizing.end(); attribute.end(); cleaning.end(); clean.end(); deadline.end() }
            let mic: [Word] = [.init("shared", start: 0, end: 0.01), .init("words", start: 0.01, end: 0.02), .init("here", start: 0.02, end: 0.03)]
            let far = mic + [.init("second", start: 3, end: 3.1)]
            func recognizer(_ words: [Word]) -> ScriptRecognizer {
                ScriptRecognizer(hearings: [.success(.init(words: words))], endings: [.success(.init(words: words))])
            }
            let http = FinalizationHTTP()
            let slot = NotesPreferences.Runtime(kind: "compatibleAPI", model: "fixture", executable: "", endpoint: "http://127.0.0.1/v1", credentialVariable: "")
            let runtime = Runtime(process: FinalizationProcess(), http: http, credential: { _ in nil }, resolveProgram: { $0 },
                                  deadline: { await deadline.next(); try Task.checkCancellation() })
            let rig = try await ComposeFixture.make(root: root,
                preferences: Preferences(notes: .init(enabled: true, primary: slot, fallback: slot), automaticRecording: false, callsFolder: root),
                summaryRuntime: runtime, recognizers: (recognizer(mic), recognizer(far)), configure: { boundary in
                    boundary.transcripts = FileTranscriptStorage(diarizer: CompositionDiarizer {
                        diarizing.send(); await attribute.next()
                    })
                    boundary.bleedCleaning = CleaningStub { _ in cleaning.send(); await clean.next(); return [0.25] }
                    boundary.bleedHearing = HearingStub { _ in [TranscriptSegment(id: 5, start: 5, end: 5.1,
                        words: [.init("answer", start: 5, end: 5.1)], settledCount: 1)] }
                })
            do {
                try await rig.start()
                try await rig.stop()
                await diarizing.next()
                #expect(try await rig.state { $0.phase == .idle }.phase == .idle)
                #expect(http.bodies.all.isEmpty)
                attribute.send()
                await cleaning.next()
                let shown = try await rig.panel {
                    guard case let .lines(lines) = $0.log else { return false }
                    return Set(lines.entries.compactMap(\.remoteSpeaker)) == [1, 2]
                }
                #expect(shown.recording == .off)
                #expect(http.bodies.all.isEmpty)
                clean.send()
                await http.started.next()
                let body = try #require(http.bodies.all.first)
                #expect(body.contains("Them 1:") && body.contains("Them 2:") && body.contains("Me:"))
                #expect(body.contains("answer") && body.contains("second"))
                let text = try await transcriptText(of: rig)
                #expect(text.contains("**Them 1** 00:00:00\nshared words here"))
                #expect(text.contains("**Them 2** 00:00:03\nsecond"))
                #expect(text.contains("**Me** 00:00:05\nanswer"))
                #expect(!text.contains("**Me** 00:00:00\nshared words here"))
                await rig.finish()
            } catch {
                attribute.send(); clean.send()
                await rig.finish()
                throw error
            }
        }
    }
}

private struct CompositionDiarizer: TranscriptDiarizer {
    let wait: @Sendable () async -> Void
    func prepare() {}
    func diarize(_ track: URL, speakers: Int?) async throws -> CallDiarizer.Diarization {
        #expect(track.lastPathComponent == "call.caf")
        #expect(speakers == nil)
        await wait()
        return .init(model: .nemotron, turns: [.init(speaker: 0, start: 0, end: 1), .init(speaker: 1, start: 3, end: 4)])
    }
}

private struct FinalizationProcess: ProcessRunning {
    func run(program: String, arguments: [String], input: Data) throws -> ProcessOutput { throw ScriptFailure.failed }
}

private final class FinalizationHTTP: HTTPRequesting, Sendable {
    let bodies = Values<String>()
    let started = Signal()
    func request(url: URL, headers: [String: String], body: Data, loopback: Bool) throws -> HTTPResponse {
        bodies.append(String(decoding: body, as: UTF8.self))
        started.send()
        let notes = "## What this was about\n\nSynthetic call\n\n## Key points\n\n- Answer\n\n## Decisions\n\nNone recorded.\n\n## Actions\n\nNone recorded.\n"
        return .init(status: 200, body: try JSONSerialization.data(withJSONObject: ["choices": [["finish_reason": "stop", "message": ["content": notes]]]]))
    }
    deinit { started.end() }
}
