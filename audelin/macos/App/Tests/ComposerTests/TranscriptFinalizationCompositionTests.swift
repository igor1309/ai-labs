import CoreAudioProcesses
import SessionRehearsal
import CallNames
import Recording
import TranscriptFormat
@testable import CallText
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
    @Test func subscriptionMapsEveryValueThenSendsShutdownWhenTheOutputEnds() async {
        let output = AsyncStream<RecordingTranscript>.makeStream()
        let received = Values<TranscriptFinalizationModel.Event>()
        let deliveringClose = Signal(), acceptClose = Signal()
        defer { deliveringClose.end(); acceptClose.end() }
        let text = CallState(status: .finished, entries: [], finalCount: 0)
        let names = CallNamesState(roster: ["Vera"], rowNames: [3: "Vera"])
        let delivery = subscribeTranscriptFinalization(output.stream) { event in
            if case .closed(call: "second", names: _) = event {
                deliveringClose.send()
                await acceptClose.next()
            }
            received.append(event)
        }
        let values: [RecordingTranscript] = [.opened(call: "first"), .wrote(call: "first", text),
            .wrote(call: "first", text), .writeFailed(call: "first"), .closed(call: "first", names: names),
            .opened(call: "second"), .closed(call: "second", names: names)]
        for value in values { output.continuation.yield(value) }
        output.continuation.finish()
        await deliveringClose.next()
        let prefix: [TranscriptFinalizationModel.Event] = [.opened(call: "first"), .wrote(call: "first", text),
            .wrote(call: "first", text), .writeFailed(call: "first"), .closed(call: "first", names: names), .opened(call: "second")]
        #expect(received.all == prefix)
        acceptClose.send()
        await delivery.value
        #expect(received.all == prefix + [.closed(call: "second", names: names), .shutdown])
    }

    @MainActor @Test
    func quitDuringTranscriptOpenPublishesItsFinalBeforeTermination() async throws {
        try await withComposeFolder { root in
            let opening = Signal(), open = Signal(), publishing = Signal(), publish = Signal()
            defer { opening.end(); open.end(); publishing.end(); publish.end() }
            let clock = FixtureClock()
            defer { clock.finish() }
            var boundary = rehearsalBoundary(capturePersistence: .recorded,
                microphone: { throw ScriptFailure.failed }, call: { _ in throw ScriptFailure.failed },
                mine: RehearsalRecognizer(SessionRecognizer(name: "mine")), theirs: RehearsalRecognizer(SessionRecognizer(name: "theirs")),
                now: clock.time.now, timeZone: { .gmt }, sleep: clock.sleep, intervals: testIntervals)
            boundary.time = clock.time
            boundary.transcripts = OpeningTranscriptStorage(opening: opening, open: open)
            boundary.processes = FixtureProcesses(binding: CallBinding(fails: false, input: false))
            boundary.access = ComposerAccess(refresh: { true }, reserve: { true }, release: {},
                states: { AsyncStream { $0.yield(true); $0.finish() } }, invalidate: {})
            boundary.microphonePermission = FixturePermission(status: { true }, prompt: {})
            boundary.capacity = FixtureCapacity(read: { _ in Int64.max })
            let preferences = PreferencesStore(fileURL: root.appendingPathComponent("preferences.json"))
            try preferences.write(Preferences(automaticRecording: false, liveText: false, callsFolder: root))
            let processes = CoreAudioProcesses(binding: BoundaryProcesses(base: boundary.processes), clock: BoundaryCallClock(time: boundary.time))
            let panel = AudelinPanel(now: clock.time.monotonicNow, ticks: clock.ticks, sink: boundary.log,
                intervals: testIntervals, browser: { nil }, sleep: clock.sleep)
            let resources = FinalizationResources()
            let events = Values<String>(), calls = Values<String>()
            let finalization = TranscriptFinalizationModel(diarizing: FinalizationDiarizing(resources: resources),
                cleanup: FinalizationCleanup(resources: resources), replacement: FinalizationReplacement(resources: resources),
                finals: FinalTranscriptsPort(resources: resources, deliver: { call, _ in
                    publishing.send()
                    await publish.next()
                    calls.append(call)
                    events.append("published")
                }))
            let menu = await AudelinMenu(storage: preferences, occupiedCallNames: { [] }, boundary: boundary,
                processes: processes, panel: panel, openFolder: { _ in }, openURL: { _ in },
                terminate: { events.append("terminated") }, sink: boundary.log, presentPanel: { _ in }, sleep: clock.sleep,
                finalization: finalization, finalizationResources: resources, language: CurrentLanguage(.english))
            await menu.perform(.start)
            await opening.next()
            let quit = Task { await menu.perform(.quit) }
            for await state in await menu.states() where state.shutdown == .requested { break }
            open.send()
            await publishing.next()
            #expect(events.all.isEmpty)
            #expect(!finalization.state.settled)
            publish.send()
            await quit.value
            #expect(events.all == ["published", "terminated"])
            let call = try #require(calls.all.first)
            #expect(calls.all == [call])
            #expect(finalization.state.calls[call]?.published == true)
            #expect(finalization.state.settled)
            #expect(resources.resource(call: call) == nil)
        }
    }

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

private struct OpeningTranscriptStorage: TranscriptStorage {
    let opening: Signal
    let open: Signal
    func open(at url: URL, names: RecordingNames, sink: any LogSink) async throws -> OpenedTranscript {
        let file = try await FileTranscriptStorage(diarizer: CallDiarizer.unavailable).open(at: url, names: names, sink: sink)
        opening.send()
        await open.next()
        return file
    }
}
