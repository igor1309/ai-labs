import CallDiarizer
import TranscriptFinalization
import BrowserBridge
import CallNames
import BlockingTestWork
import CoreAudioProcesses
import Foundation
import LiveText
import PanelUI
import Preferences
import Calls
import Recording
import SessionRehearsal
import Synchronization
import Testing
@testable import Composer

/// What the composed Recording's pieces do, on the boundary an application composes them with.
@Suite(.timeLimit(.minutes(1)))
struct RecordingPiecesWiringTests {

    @Test func stoppingDuringPanelSetupLeavesNoNamingWatch() async throws {
        let entered = Signal(), proceed = Signal()
        defer { entered.end(); proceed.end() }
        try await withPieces(buildReading: {
            entered.send()
            await proceed.next()
            return makeReading()
        }) { rig in
            await rig.recording.send(.userStart)
            await entered.next()
            await rig.stop()
            proceed.send()
            await rig.recording.end()
            #expect(await rig.panel.names.observation(of: 1) == nil)
            #expect(rig.microphones.count == 0 && rig.calls.count == 0)
        }
    }

    @Test func readingUsesTheRecordingInstantEvenWhenItsDeliveryWaits() async throws {
        let waiting = Signal(), proceed = Signal(), clock = FixtureClock()
        let publishing = Signal(), delivered = Signal()
        let storage = NamesStorage(opens: true, diarizer: CallDiarizer.unavailable)
        defer { waiting.end(); proceed.end(); publishing.end(); delivered.end() }
        try await withPieces(clock: clock, waiting: { _ in
            waiting.send()
            await proceed.next()
        }, publishing: { _ in
            publishing.send()
            await delivered.next()
        }, configure: { $0.transcripts = storage }) { rig in
            let finished = await rig.record()
            let first = try #require(storage.ports.all.first)
            let firstStates = await first.states()
            await rig.stop()
            await waiting.next()
            await publishing.next()
            clock.advance(100)
            _ = await rig.record()
            try #require(storage.ports.all.count == 2)
            let second = try #require(storage.ports.all.last)
            for await names in await second.states() where names.recordingStart != nil { break }
            #expect(second.snapshot().recordingStart == 100)
            delivered.end()
            for await _ in firstStates {}
            let folder = try #require(finished.pieces?.recordedFolder?.id)
            #expect(rig.published.all == [folder])
            clock.advance(3, tick: false)
            proceed.end()

            for await shown in await rig.panel.states() {
                if case .on = shown.recording { break }
            }
            clock.advance(1)
            for await shown in await rig.panel.states() {
                if case let .on(elapsed) = shown.recording, elapsed != "00:00:00" {
                    #expect(elapsed == "00:00:04")
                    break
                }
            }
            let secondStates = await second.states()
            await rig.stop()
            var sawSecondStop = false
            for await names in secondStates where names.recordingStart == nil { sawSecondStop = true }
            #expect(sawSecondStop)
        }
    }

    @Test func recordingConfirmsTheFinishedCallsNamesWhileTheNextCallRecords() async throws {
        let clock = FixtureClock()
        let firstChannel = FakeBrowserChannel(), secondChannel = FakeBrowserChannel()
        let diarizing = Signal(), finishDiarizing = Signal()
        let firstSpeech = Signal(), secondSpeech = Signal()
        defer { diarizing.end(); finishDiarizing.end(); firstSpeech.end(); secondSpeech.end() }
        let storage = NamesStorage(opens: true, diarizer: GatedNamesDiarizer(entered: diarizing, proceed: finishDiarizing))
        let hearing = Hearing(words: [Word("привет", start: 2, end: 4)])
        let remotes = Mutex([firstSpeech, secondSpeech].map {
            ScriptRecognizer(hearings: [.success(hearing), .success(Hearing(words: []))], endings: [.success(hearing)], release: $0)
        })

        try await withPieces(clock: clock, browser: {
            if firstChannel.opens == 0 { return firstChannel.open() }
            #expect(firstChannel.stopped)
            return secondChannel.open()
        }, liveText: true, configure: { boundary in
            boundary.transcripts = storage
            let base = boundary.recognizers
            boundary.recognizers = FixtureRecognizers(source: {
                if $0 == .call {
                    let remote = try remotes.withLock { try #require($0.isEmpty ? nil : $0.removeFirst()) }
                    return RehearsalRecognizer(remote)
                }
                return try await base.recognizer(for: $0)
            }, missing: base.missingModels, load: base.startLoading)
        }) { rig in
            _ = await rig.record()
            let first = try #require(storage.ports.all.first)
            try await reportSpeaker("Анна", on: firstChannel, to: first, clock: clock)
            firstSpeech.end()
            let liveFirst = try #require(await first.states().first { !$0.rowNames.isEmpty })
            let rowID = try #require(liveFirst.rowNames.keys.first)
            #expect(liveFirst.rowNames == [rowID: "Анна"])
            #expect(!liveFirst.confirmed)
            let firstNames = await first.states()
            await rig.stop()

            _ = await rig.record()
            try #require(storage.ports.all.count == 2)
            let second = try #require(storage.ports.all.last)
            try await reportSpeaker("Борис", on: secondChannel, to: second, clock: clock)
            secondSpeech.end()
            let liveSecond = try #require(await second.states().first { !$0.rowNames.isEmpty })
            #expect(liveSecond.rowNames == [rowID: "Борис"])
            #expect(!liveSecond.confirmed)

            await diarizing.next()
            finishDiarizing.end()
            let confirmed = try #require(await firstNames.first { $0.confirmed })
            #expect(confirmed.rowNames == [rowID: "Анна"])
            #expect(second.snapshot().rowNames == [rowID: "Борис"])
            #expect(!second.snapshot().confirmed)
            #expect(!secondChannel.stopped)
            await rig.stop()
        }
    }

    @Test(arguments: [true, false])
    func sessionNamesTheRowAndReleasesItsPort(opensTranscript: Bool) async throws {
        let clock = FixtureClock(), channel = FakeBrowserChannel()
        let storage = NamesStorage(opens: opensTranscript, diarizer: CallDiarizer.unavailable)
        let heard = Signal(), speak = Signal()
        let word = Word("привет", start: 2, end: 4)
        let hearing = Hearing(words: [word])
        let remote = ScriptRecognizer(hearings: [.success(hearing), .success(Hearing(words: []))],
                                      endings: [.success(hearing)], blocked: heard, release: speak)
        defer { heard.end(); speak.end() }
        try await withPieces(clock: clock, browser: { channel.open() }, liveText: true, configure: { boundary in
            boundary.transcripts = storage
            let base = boundary.recognizers
            boundary.recognizers = FixtureRecognizers(source: {
                if $0 == .call { return RehearsalRecognizer(remote) }
                return try await base.recognizer(for: $0)
            }, missing: base.missingModels, load: base.startLoading)
        }) { rig in
            clock.advance(100)
            let recording = await rig.record()
            await heard.next()
            let port = try #require(storage.ports.all.first)
            var states = await port.states().makeAsyncIterator()
            while let names = await states.next(), names.recordingStart == nil {}
            #expect(port.snapshot().recordingStart == 100)
            let peer = channel.connect()
            var sent = peer.sent.makeAsyncIterator()
            try #require(await sent.next() == BrowserClockReply.ping(0))
            peer.send(#"{"version":1,"ping":0,"at":100000}"#)
            for await names in await port.states() where names.browserConnections == [0] { break }
            clock.advance(5)
            peer.send(browserMessage(0, #"{"type":"roster","at":100000,"participants":[{"id":"t1","name":"Анна","isSelf":false}]}"#))
            peer.send(browserMessage(1, #"{"type":"speakingStarted","at":101500,"participantId":"t1"}"#))
            peer.send(browserMessage(2, #"{"type":"speakingStopped","at":104500,"participantId":"t1"}"#))
            for await names in await port.states() where names.browser.intervals.first?.end == 4.5 { break }
            speak.end()

            for await shown in await rig.panel.states() {
                guard case let .lines(lines) = shown.log,
                      let row = lines.entries.first(where: { $0.speaker == .them && $0.label == "Анна" }) else { continue }
                #expect(row.labelIsTentative)
                break
            }
            try #require(port.snapshot().rowNames.values.contains("Анна"))
            await rig.stop()
            while await states.next() != nil {}
            let released = port.snapshot()
            #expect(!released.confirmed)
            await port.diarized([.init(speaker: 0, start: 2, end: 4)], rows: [.init(id: 99, start: 2, end: 4)])
            var after = await port.states().makeAsyncIterator()
            #expect(await after.next() == released)
            #expect(await after.next() == nil)
            let folder = try #require(recording.pieces?.recordedFolder?.id)
            #expect(rig.published.all == (opensTranscript ? [folder] : []))
        }
    }

    @Test func shutdownFinishesTranscriptOutputAfterLastClose() async throws {
        try await withPieces(consumeTranscript: false) { rig in
            let output = Task {
                var received: [RecordingTranscript] = []
                for await value in rig.recording.transcriptOutput { received.append(value) }
                return received
            }
            _ = await rig.record()
            await rig.recording.send(.shutdown)
            _ = await rig.wait { $0.shutdown == .settled }
            let received = await output.value
            guard case let .opened(call) = try #require(received.first) else {
                Issue.record("missing opening"); return
            }
            guard case let .closed(closedCall, _) = try #require(received.last) else {
                Issue.record("missing last close"); return
            }
            #expect(closedCall == call)
            #expect(received.filter { if case .closed = $0 { true } else { false } }.count == 1)
            await rig.resources.published(call: call)
        }
    }

    /// The session's reading feed ends with it even when no transcript opened to close it.
    @Test func aRecordingWhoseTranscriptNeverOpenedStillEnds() async throws {

        try await withPieces(folderFails: true) { rig in
            await rig.recording.send(.userStart)
            _ = await rig.wait { $0.phase == .idle && $0.lastSessionID == 1 }
            #expect(await rig.panel.states().first(where: { _ in true })?.recording == .off)
        }
    }

    @Test func endingARecordingTellsNotesItsCallIsWaitingOnce() async throws {
        let waiting = Signal()
        defer { waiting.end() }
        try await withPieces(waiting: { _ in waiting.send() }) { rig in
            let recording = await rig.record()
            #expect(rig.waiting.all.isEmpty)
            await rig.stop()
            await waiting.next()
            #expect(rig.waiting.all.count == 1)
            #expect(recording.callID != nil)
            #expect(rig.waiting.all.map(\.lastPathComponent).compactMap { Calls.id(in: $0, timeZone: .gmt) } == [recording.callID].compactMap { $0 })
        }
    }

    @Test func eachRecordingBuildsItsOwnPieces() async throws {

        try await withPieces { rig in
            _ = await rig.record()
            await rig.stop()
            #expect(rig.microphones.count == 1)
            _ = await rig.record()
            await rig.stop()
            #expect(rig.microphones.count == 2)
        }
    }

    @Test func cannotRecordAndFaultsReachRecording() async throws {

        try await withPieces { rig in
            _ = await rig.record()
            rig.microphones.capture(0).end(throwing: ScriptFailure.failed)
            _ = await rig.wait { $0.faults.contains(.microphone) }
            rig.calls.capture(0).end(throwing: ScriptFailure.failed)
            let failed = await rig.wait { $0.faults == [.microphone, .callAudio] }
            #expect(failed.cannotRecord == "no track can record")
            _ = await rig.wait { $0.phase == .idle }
        }
    }

    /// Audio windows change only the pieces: Recording's log and its own-state feed pass over them.
    @Test func audioWindowsReachNeitherRecordingsLogNorItsOwnStates() async throws {

        try await withPieces { rig in
            let recording = await rig.record()
            let id = recording.session!.id
            var own = await rig.recording.ownStates().makeAsyncIterator()
            _ = await own.next()
            let logged = rig.log.entries.all.filter { $0.category == .recording }.count
            for start in 0..<5 {
                await rig.recording.send(.session(id: id, .microphoneLevel(start: Double(start), end: Double(start) + 1, rms: 0.1)))
            }
            await rig.recording.send(.automaticChanged(!recording.automatic))
            #expect(await own.next()?.automatic == !recording.automatic)
            #expect(rig.log.entries.all.filter { $0.category == .recording }.count == logged + 1)
            #expect(await rig.recording.state().pieces?.audioObservation != recording.pieces?.audioObservation)
            await rig.stop()
        }
    }

    @Test func theLiveTextSwitchReachesTheRecordingsPieces() async throws {

        try await withPieces { rig in
            _ = await rig.record()
            await rig.panel.send(.switchLiveTextOn)
            await rig.log.wait { wants($0, id: 1) }
            await rig.stop()
        }
    }
}

/// The same through the menu: a session that follows another owns its switch.
@Suite(.timeLimit(.minutes(1)))
struct FollowingSessionsTests {

    @Test func theLiveTextSwitchReachesOnlyTheSessionNowRecording() async throws {

        try await withComposition(preferences: { .init(automaticRecording: false, liveText: false, callsFolder: $0) }) { rig in
            try await rig.start()
            try await rig.stop()
            try await rig.start()
            await rig.menu.sendPanel(.switchLiveTextOn)
            await rig.log.wait { wants($0, id: 2) }
            #expect(!rig.log.entries.all.contains { wants($0, id: 1) })
            try await rig.stop()
            await rig.menu.sendPanel(.switchLiveTextOn)
            #expect(rig.log.entries.all.filter { wants($0, id: 3) }.isEmpty)
        }
    }
}

private func wants(_ entry: LogEntry, id: UInt64) -> Bool {

    entry.message.hasPrefix("state id=\(id) ") && entry.message.contains(" wantedLiveText=true ")
}

/// Counts every capture made, and keeps each so a test can end it.
private final class Captures: Sendable {
    private let made = Values<CaptureScript<CaptureBuffer>>()
    private let stopped = Mutex(0)
    var count: Int { made.all.count }
    var stops: Int { stopped.withLock { $0 } }
    func capture(_ index: Int) -> AsyncThrowingStream<CaptureBuffer, any Error>.Continuation { made.all[index].source.continuation }
    func start() throws -> StartedCapture<CaptureBuffer> {
        let script = CaptureScript<CaptureBuffer>(first: .init(samples: [0.25], sampleRate: 48_000), last: .init(samples: [0.5], sampleRate: 48_000), fails: false)
        made.append(script)
        let started = try script.start()
        return StartedCapture(stream: started.stream, stop: {
            self.stopped.withLock { $0 += 1 }
            try await started.stop()
        })
    }
}

private extension AsyncThrowingStream<CaptureBuffer, any Error>.Continuation {
    func end(throwing error: any Error) { finish(throwing: error) }
}

private struct PiecesRig: Sendable {
    let recording: RecordingInputs
    let resources: FinalizationResources
    let panel: AudelinPanel
    let microphones: Captures
    let calls: Captures
    let waiting: Values<URL>
    let published: Values<String>
    let log: FixtureLog
}

private extension PiecesRig {
    func wait(until met: (RecordingState) -> Bool) async -> RecordingState {
        for await state in await recording.states() where met(state) { return state }
        return await recording.state()
    }
    /// Starts a recording and waits until it records.
    func record() async -> RecordingState {
        await recording.send(.userStart)
        return await wait { $0.phase == .recording }
    }
    func stop() async {
        await recording.send(.userStop)
        _ = await wait { $0.phase == .idle }
    }
}

private func withPieces(
    folderFails: Bool = false, consumeTranscript: Bool = true, clock: FixtureClock = FixtureClock(),
    browser: @escaping @Sendable () -> BrowserChannel? = { nil },
    liveText: Bool = false, waiting onWaiting: @escaping @Sendable (URL) async -> Void = { _ in },
    publishing: @escaping @Sendable (String) async -> Void = { _ in },
    buildReading: @escaping @MainActor @Sendable () async -> ReadingInputs = { makeReading() },
    configure: @Sendable (inout ComposerBoundary) -> Void = { _ in },
    _ body: @Sendable (PiecesRig) async throws -> Void
) async throws {

    try await withComposeFolder { root in
        let microphones = Captures(), calls = Captures(), waiting = Values<URL>(), published = Values<String>(), log = FixtureLog()
        defer { clock.finish() }
        var boundary = rehearsalBoundary(capturePersistence: .recorded,
            microphone: { try microphones.start() }, call: { _ in try calls.start() },
            mine: RehearsalRecognizer(SessionRecognizer(name: "mine")), theirs: RehearsalRecognizer(SessionRecognizer(name: "theirs")),
            now: { Date(timeIntervalSince1970: 0) }, timeZone: { .gmt }, sleep: clock.sleep, intervals: testIntervals,
            transcriptBuild: testTranscriptBuild)
        boundary.time = clock.time
        boundary.transcripts = FileTranscriptStorage(diarizer: CallDiarizer.unavailable)
        boundary.log = log
        boundary.access = ComposerAccess(refresh: { true }, reserve: { true }, release: {},
                                         states: { AsyncStream { $0.yield(true); $0.finish() } }, invalidate: {})
        boundary.processes = FixtureProcesses(binding: CallBinding(fails: false))
        configure(&boundary)
        let url = root.appendingPathComponent("preferences.json")
        let preferences = try {
            let store = PreferencesStore(fileURL: url)
            // A plain file where the calls folder should be: no call folder, so no transcript, can open.
            let calls = folderFails ? root.appendingPathComponent("calls-file") : root
            if folderFails { try Data().write(to: calls) }
            try store.write(Preferences(liveText: liveText, callsFolder: calls))
            return store
        }()
        let processes = CoreAudioProcesses(binding: BoundaryProcesses(base: boundary.processes), clock: BoundaryCallClock(time: boundary.time))
        let app = RecordingCallApp()
        app.started("us.zoom.xos")
        let panel = await AudelinPanel(now: clock.time.monotonicNow, ticks: clock.ticks, sink: log, intervals: testIntervals,
                                       browser: browser, sleep: clock.sleep, zoomName: unknownZoomName, buildReading: buildReading)
        let resources = await FinalizationResources()
        let finalization = await TranscriptFinalizationModel(diarizing: FinalizationDiarizing(resources: resources),
            cleanup: FinalizationCleanup(resources: resources), replacement: FinalizationReplacement(resources: resources),
            finals: FinalTranscriptsPort(resources: resources, deliver: { call, _ in
                published.append(call)
                await publishing(call)
            }))
        let recording = await composeRecording(preferences: preferences,
                                               folderClaim: RecordingFolderClaim(storage: callsStorage(folder: preferences.read().callsFolder, timeZone: .current, trash: { _ in })),
                                               occupiedCallNames: { [] }, callApp: app, processes: processes, boundary: boundary,
                                               panel: panel, finalizationResources: resources,
                                               summaries: SummaryCallbacks(waiting: { waiting.append($0); await onWaiting($0) }))
        let delivery = consumeTranscript ? subscribeTranscriptFinalization(recording.transcriptOutput, send: { await finalization.send($0) }) : nil
        for condition in [RecordingCondition.callAudioAccess, .microphoneAccess, .callsFolder, .room] {
            await recording.send(.conditionChanged(condition, available: true))
        }
        try await body(PiecesRig(recording: recording, resources: resources, panel: panel, microphones: microphones, calls: calls,
                                 waiting: waiting, published: published, log: log))
        await finalization.send(.shutdown)
        await recording.end()
        await delivery?.value
        if delivery == nil { await finalization.send(.inputEnded) }
        await finalization.settled()
        await processes.stop()
    }
}

private struct NamesStorage: TranscriptStorage {
    let opens: Bool
    let diarizer: any TranscriptDiarizer
    let ports = Values<RecordingNames>()

    func open(at url: URL, names: RecordingNames, origin: TranscriptOrigin, sink: any LogSink) async throws -> OpenedTranscript {
        ports.append(names)
        guard opens else { throw ScriptFailure.failed }
        return try await FileTranscriptStorage(diarizer: diarizer).open(at: url, names: names, origin: origin, sink: sink)
    }
}

private struct GatedNamesDiarizer: TranscriptDiarizer {
    let entered: Signal
    let proceed: Signal

    func prepare() {}

    func diarize(_ track: URL, speakers: Int?) async throws -> CallDiarizer.Diarization {
        entered.send()
        await proceed.next()
        return .init(model: .nemotron, turns: [.init(speaker: 0, start: 2, end: 4), .init(speaker: 0, start: 5, end: 8)])
    }
}

private func reportSpeaker(_ name: String, on channel: FakeBrowserChannel, to port: RecordingNames, clock: FixtureClock) async throws {
    try #require(await port.states().first { $0.recordingStart != nil } != nil)
    // The browser reads 100 s at call time 10 s. The speaker covers the live row and both diarized turns.
    clock.advance(10)
    let peer = channel.connect()
    var sent = peer.sent.makeAsyncIterator()
    try #require(await sent.next() == BrowserClockReply.ping(0))
    peer.send(#"{"version":1,"ping":0,"at":100000}"#)
    peer.send(browserMessage(0, #"{"type":"roster","at":90000,"participants":[{"id":"t1","name":"\#(name)","isSelf":false}]}"#))
    peer.send(browserMessage(1, #"{"type":"speakingStarted","at":91000,"participantId":"t1"}"#))
    peer.send(browserMessage(2, #"{"type":"speakingStopped","at":99000,"participantId":"t1"}"#))
    try #require(await port.states().first { $0.browser.intervals.first?.end == 9 } != nil)
}
