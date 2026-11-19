import CallDiarizer
import Calls
import Foundation
import Observation
import Preferences
import ReRecognition
import Recordings
import SettingsUI
import SummaryFiles
import SummaryJobs
import SummaryPreviewUI
import Testing
import TrackFile
import TranscriptFormat
@testable import Composer

@Suite(.timeLimit(.minutes(1)))
struct TranscriptAgainCompositionTests {
    @Test func reportsCarryTheRequestIntoRecordings() async {
        let chain = chain(hear: { _, report in await report(0.4); return .init(words: [], model: "model") })
        let handler = RecordingsEffectHandler(calls: UnusedCalls(), transcriptAgain: chain, reserve: { nil }, release: { _ in },
                                              storeFolder: { _ in }, describe: { String(describing: $0) })
        var events: [RecordingsEvent] = []
        for await event in handler.handle(.makeTranscriptAgain(id: "call", request: 42)) { events.append(event) }
        #expect(events == [
            .transcriptReported(request: 42, .waiting(.preparing)),
            .transcriptReported(request: 42, .waiting(.hearing(0.2))),
            .transcriptReported(request: 42, .waiting(.hearing(0.5))),
            .transcriptReported(request: 42, .waiting(.hearing(0.7))),
            .transcriptReported(request: 42, .waiting(.hearing(1))),
            .transcriptReported(request: 42, .waiting(.finishing)),
            .transcriptReported(request: 42, .made),
        ])
    }

    @Test(arguments: [false, true])
    func stopTargetsOnlyItsRequest(current: Bool) async {
        let entered = AsyncStream<Void>.makeStream(), release = AsyncStream<Void>.makeStream()
        let chain = chain(hear: { _, _ in
            entered.continuation.yield(())
            for await _ in release.stream {}
            return .init(words: [], model: "model")
        })
        let stream = chain.run(id: "call", request: 2)
        let result = Task { var reports: [TranscriptReport] = []; for await report in stream { reports.append(report) }; return reports }
        var start = entered.stream.makeAsyncIterator()
        _ = await start.next()
        await chain.stop(id: "call", request: current ? 2 : 1)
        release.continuation.finish()
        entered.continuation.finish()
        #expect(await result.value.last == (current ? .stopped : .made))
    }

    @Test @MainActor func remakeAndRestoreRefreshTheShownDetailAndKeepTheOldBytes() async throws {
        try await withComposeFolder { root in
            let id = "1970.01.01-1000", folder = root.appendingPathComponent(id)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            for name in ["call", "microphone"] {
                let track = try await TrackFile(url: folder.appendingPathComponent(name + ".caf"))
                try await track.write(Array(repeating: 0, count: 4 * 48_000), sampleRate: 48_000)
                try await track.close()
            }
            var format = TranscriptFormat()
            let old = try format.render([
                .init(side: .theirs, start: 1, settled: "Old call", pending: "", speaker: "p"),
                .init(side: .mine, start: 2, settled: "Old microphone", pending: ""),
            ], speakers: [.init(id: "p", name: "Ada", state: "confirmed")]).chunks.reduce(Data(), +)
            try old.write(to: folder.appendingPathComponent("transcript.md"))
            let storage = callsStorage(folder: root, timeZone: .gmt, trash: removeForTrash)
            let files = SummaryFiles.Files(locations: storage, disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            let preparation = SummariesPreparationPort(notes: { .init(enabled: false) }, makeID: { "fixture" },
                                                       callText: { try await storage.text(id: $0) })
            let job = await preparation.job(for: try await preparation.submission(call: id)).job
            let port = SummariesFilesPort(files: files, makeID: { "unused" })
            _ = try await port.claim(job)
            #expect(try await port.start(job))
            try await port.publish(job, notes: "# Kept notes", warning: false, keeping: .replacement)
            try await port.save(job, stage: .succeeded, warning: false)
            await port.release(job)
            let rig = try await ComposeFixture.make(root: root, preferences: .init(automaticRecording: false, liveText: false, callsFolder: root),
                configure: { boundary in
                    boundary.recognizers = KeptRecognizers()
                    boundary.diarizer = KeptDiarizer()
                })
            do {
                let calls = try #require(rig.menu.calls)
                calls.show()
                for await state in Observations({ calls.recordingsState }) where state.transcriptOffers[id]?.run == .available { break }
                await calls.send(.select(id))
                for await detail in Observations({ calls.detail }) where detail?.pair?.current.text == "# Kept notes" { break }
                #expect(calls.detail?.transcriptMark == nil)
                await calls.send(.makeTranscriptAgain(id))
                for await state in Observations({ calls.recordingsState }) where state.transcriptChanged?.request == 1 && !state.isListing { break }
                #expect(calls.recordingsState.failure == nil)
                #expect(calls.recordingsState.calls.first?.hasPreviousTranscript == true)
                #expect(calls.recordingsState.calls.first?.missingTracks == [])
                for await detail in Observations({ calls.detail }) where detail?.transcriptMark != nil { break }
                #expect(calls.detail?.transcriptMark == "Итоги по прежнему транскрипту")
                #expect(try Data(contentsOf: folder.appendingPathComponent("transcript-previous.md")) == old)
                let changed = try Data(contentsOf: folder.appendingPathComponent("transcript.md"))
                let read = TranscriptFormat.read(String(decoding: changed, as: UTF8.self))
                #expect(read.segments.map(\.settled) == ["New call", "New microphone"])
                #expect(read.speakers.map(\.name) == ["Ada"])
                #expect(read.origin?.calls.first?.origin?.hearing == testTranscriptBuild.release)
                await calls.send(.restorePreviousTranscript(id))
                for await state in Observations({ calls.recordingsState }) where state.transcriptChanged?.request == 2 && !state.isListing { break }
                for await detail in Observations({ calls.detail }) where detail?.transcriptMark == nil { break }
                #expect(try Data(contentsOf: folder.appendingPathComponent("transcript.md")) == old)
                #expect(try Data(contentsOf: folder.appendingPathComponent("transcript-previous.md")) == changed)
                await rig.finish()
            } catch { await rig.finish(); throw error }
        }
    }

    @Test(arguments: [false, true]) @MainActor
    func nestedOriginalsKeepTheirOffsetsAndListingMetadata(missing: Bool) async throws {
        try await withComposeFolder { root in
            let first = "1970.01.01-1000", second = "1970.01.01-1001", third = "1970.01.01-1002"
            let outer = root.appendingPathComponent(first), nested = outer.appendingPathComponent(first)
            let originals = [nested.appendingPathComponent(first), nested.appendingPathComponent(second), outer.appendingPathComponent(third)]
            let archived = Data("Archived original transcript".utf8)
            for (index, folder) in originals.enumerated() {
                try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                for name in ["call", "microphone"] where !(missing && index == 0 && name == "microphone") {
                    let track = try await TrackFile(url: folder.appendingPathComponent(name + ".caf"))
                    try await track.write(Array(repeating: 0, count: 4 * 48_000), sampleRate: 48_000)
                    try await track.close()
                }
                try archived.write(to: folder.appendingPathComponent("transcript.md"))
            }
            let old = Data("# Transcript\n\n**Me** 00:00:00\nOld merged words.\n".utf8)
            try old.write(to: outer.appendingPathComponent("transcript.md"))
            try Data("Older previous".utf8).write(to: outer.appendingPathComponent("transcript-previous.md"))
            let rig = try await ComposeFixture.make(root: root, configure: { boundary in
                boundary.recognizers = KeptRecognizers(); boundary.diarizer = KeptDiarizer()
            })
            do {
                let calls = try #require(rig.menu.calls)
                calls.show()
                for await state in Observations({ calls.recordingsState }) where !state.calls.isEmpty && !state.isListing { break }
                #expect(calls.recordingsState.calls.first?.hasPreviousTranscript == true)
                if missing {
                    #expect(calls.recordingsState.calls.first?.missingTracks == [.init(id: first, track: .microphone)])
                    guard case let .unavailable(reason, message) = calls.recordingsState.transcriptOffers[first]?.run else {
                        Issue.record("Missing track was offered"); await rig.finish(); return
                    }
                    #expect(reason == .missingTracks([.init(id: first, track: .microphone)]))
                    #expect(message.contains(first) && message.contains("микрофона"))
                } else {
                    for await state in Observations({ calls.recordingsState }) where state.transcriptOffers[first]?.run == .available { break }
                    await calls.send(.makeTranscriptAgain(first))
                    for await state in Observations({ calls.recordingsState }) where state.transcriptChanged != nil && !state.isListing { break }
                    #expect(calls.recordingsState.failure == nil)
                    let joined = TranscriptFormat.read(try String(contentsOf: outer.appendingPathComponent("transcript.md"), encoding: .utf8))
                    #expect(joined.segments.map(\.start) == [1, 2, 4, 61, 62, 64, 121, 122])
                    #expect(joined.origin?.mergedBy == testTranscriptBuild.release)
                    #expect(joined.origin?.calls.map(\.start) == [Date(timeIntervalSince1970: 36_000), Date(timeIntervalSince1970: 36_060), Date(timeIntervalSince1970: 36_120)])
                    #expect(try Data(contentsOf: outer.appendingPathComponent("transcript-previous.md")) == old)
                    for folder in originals { #expect(try Data(contentsOf: folder.appendingPathComponent("transcript.md")) == archived) }
                }
                await rig.finish()
            } catch { await rig.finish(); throw error }
        }
    }

    @Test func notesIdentityTravelsFromTextThroughJobAndFiles() async throws {
        let preparation = SummariesPreparationPort(notes: { .init(enabled: true) }, makeID: { "job" },
            callText: { _ in .init(transcript: [.init(start: 1, words: "Spoken", label: "Them")], identity: "saved-bytes-digest") })
        let submission = try await preparation.submission(call: "call")
        let job = await preparation.job(for: submission).job
        let files = FilesFake(), port = SummariesFilesPort(files: files, makeID: { "unused" })
        try await port.publish(job, notes: "Notes", warning: false, keeping: .rotation)
        guard case let .publish(_, notes, _, _, identity) = files.writes.first else { Issue.record("Missing publication"); return }
        #expect(notes == "Notes" && identity == "saved-bytes-digest")
    }

    @Test func eachNotesVersionAndTheCurrentTranscriptReachDetail() {
        let versions = SummaryFiles.Versions(previous: .init(text: "Previous", made: .distantPast, transcriptIdentity: "one"),
                                            current: .init(text: "Current", made: .distantPast, transcriptIdentity: "two"))
        let pair = callNotesPair(versions, transcript: .init(transcript: [], identity: "three"), hasPrevious: true, made: { _ in "made" })
        #expect(pair.previous?.transcriptIdentity == "one")
        #expect(pair.current.transcriptIdentity == "two")
        #expect(pair.currentTranscriptIdentity == "three" && pair.hasPreviousTranscript)
    }

    @Test(arguments: SettingsLanguage.allCases)
    func refusalMessagesAreLocalized(language: SettingsLanguage) {
        let text = SettingsText(language: language)
        let reasons: [TranscriptRefusal] = [.notIdle, .actionUnderWay, .noPreviousTranscript, .callNotFound, .recordingStarted,
            .runningTranscript(id: "A"), .missingTracks([.init(id: "B", track: .call), .init(id: "C", track: .microphone)])]
        let expected = language == .english ? [
            "Audelin is busy. Try again when it is idle.", "Another call action is under way.", "There is no previous transcript.",
            "The call could not be found.", "A recording started.", "A transcript is being made again for “A”.",
            "Missing audio: B: call track; C: microphone track.",
        ] : [
            "Audelin занят. Повторите, когда он освободится.", "Выполняется другое действие со звонками.", "Прежнего транскрипта нет.",
            "Звонок не найден.", "Началась запись звонка.", "Уже идёт распознавание звонка «A».",
            "Нет аудио: B: дорожка звонка; C: дорожка микрофона.",
        ]
        #expect(reasons.map { transcriptMessage($0, text: text) } == expected)
        let reducer = recordingsReducer { text }
        let state = RecordingsState(calls: [.init(id: "A", title: "", start: .distantPast, duration: 1)], mergeAvailable: false)
        #expect(reducer.reduce(state, .makeTranscriptAgain("A")).0.failure?.reason == expected[0])
    }

    private func chain(hear: @escaping @Sendable (String, ReRecognition.Fraction) async throws -> ReRecognition.Heard) -> TranscriptAgainChain {
        .init(originals: { _ in [.init(id: "original", farTrack: "far", microphoneTrack: "mic", duration: 4)] },
            recognition: .init(hear: hear, split: { _, _ in nil }, clean: { _, _, _ in nil }, readOld: { _ in [] },
                               names: ReRecognition.carryNames, publish: { _, _ in }),
            build: .init(version: "version", number: "number"), describe: { String(describing: $0) })
    }
}

private struct KeptRecognizers: RecognizerSource {
    func recognizer(for side: ComposerSide) async throws -> any SpeechRecognizer { KeptRecognizer(mine: side == .microphone) }
    func missingModels() -> [String] { [] }
    func startLoading() -> Task<Void, any Error> { Task {} }
}
private struct KeptRecognizer: SpeechRecognizer {
    let mine: Bool
    func hear(_ chunk: SpeechAudio) async throws -> SpeechHearing { .init(words: []) }
    func finish() async throws -> SpeechHearing {
        .init(words: [.init(mine ? "New microphone" : "New call", start: mine ? 2 : 1, end: mine ? 2.8 : 1.8)], finalThrough: 4)
    }
}
private struct KeptDiarizer: TranscriptDiarizer {
    func prepare() async {}
    func diarize(_ track: URL, speakers: Int?) async throws -> CallDiarizer.Diarization {
        .init(model: .nemotron, turns: [.init(speaker: 7, start: 0, end: 4)])
    }
}
private struct UnusedCalls: RecordingsCalls {
    func list() async throws -> [RecordedCall] { Issue.record("Unexpected list"); return [] }
    func rename(id: String, title: String) async throws { Issue.record("Unexpected rename") }
    func delete(id: String) async throws { Issue.record("Unexpected delete") }
    func prepareMove(to: URL) async throws -> [MoveCall] { Issue.record("Unexpected prepare"); return [] }
    func move(id: String, to: URL) async throws -> Int64 { Issue.record("Unexpected move"); return 0 }
    func merge(ids: [String]) async throws -> String { Issue.record("Unexpected merge"); return "" }
    func setTags(id: String, tags: [String]) async throws { Issue.record("Unexpected tags") }
    func restorePreviousTranscript(id: String) async throws { Issue.record("Unexpected restore") }
}
