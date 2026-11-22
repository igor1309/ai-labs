import CallDiarizer
import Calls
import CallsStorage
import Synchronization
import Foundation
import Observation
import Preferences
import ReRecognition
import Recordings
import SessionRehearsal
import SettingsUI
import SummaryFiles
import SummaryJobs
import SummaryPreviewUI
import Testing
import TrackFile
import TranscriptFile
import TranscriptFormat
@testable import Composer

@Suite(.timeLimit(.minutes(1)))
struct TranscriptAgainCompositionTests {
    @Test @MainActor func recordingsPublishesEachWaitAndTerminalStateInOrder() async {
        let initial = RecordingsState(transcriptRun: .init(id: "A", request: 1), transcriptRequest: 1, selectedCallID: "A")
        let inputs = makeRecordings(handler: .init(calls: UnusedCalls(), transcriptAgain: chain(hear: { _, _ in
            Issue.record("Unexpected recognition"); return .init(words: [], model: "unused")
        }), reserve: { nil }, release: { _ in }, storeFolder: { _ in }, describe: { String(describing: $0) }),
                                    text: { SettingsText(language: .russian) }, initial: initial)
        var updates = inputs.states().makeAsyncIterator()
        inputs.send(.transcriptReported(request: 1, .waiting(.finishing)))
        inputs.send(.transcriptReported(request: 1, .stopped))

        #expect(await updates.next() == initial)
        #expect(await updates.next()?.transcriptRun?.wait == .finishing)
        let terminal = await updates.next()
        #expect(terminal?.transcriptRun == nil)
        #expect(terminal?.selectedCallID == "A")
        #expect(terminal?.transcriptRequest == 1)
    }

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

    enum FailurePoint: CaseIterable { case resolving, loading, hearing, publishing }

    @Test(arguments: FailurePoint.allCases, [false, true])
    func failuresTravelThroughTheChain(point: FailurePoint, merged: Bool) async {
        let reason = "injected storage or speech failure"
        struct Failure: Error, CustomStringConvertible {
            let description: String
        }
        let original = ReRecognition.OriginalCall(id: "original", farTrack: "far", microphoneTrack: "mic", duration: 4)
        let chain = TranscriptAgainChain(originals: { _ in
            if point == .resolving { throw Failure(description: reason) }
            return merged ? [original, .init(id: "later", farTrack: "far2", microphoneTrack: "mic2", duration: 4, start: 8)] : [original]
        }, recognition: .init(hear: { path, _ in
            if point == .loading || (point == .hearing && path == (merged ? "far2" : "far")) { throw Failure(description: reason) }
            return .init(words: [], model: "model")
        }, split: { _, _ in nil }, clean: { _, _, _ in nil }, readOld: { _ in [] }, names: ReRecognition.carryNames,
           publish: { _, _ in if point == .publishing { throw Failure(description: reason) } }),
           build: .init(version: "version", number: "build"), describe: { "described: \($0)" })
        let handler = RecordingsEffectHandler(calls: UnusedCalls(), transcriptAgain: chain, reserve: { nil }, release: { _ in },
                                              storeFolder: { _ in }, describe: { String(describing: $0) })
        var events: [RecordingsEvent] = []
        for await event in handler.handle(.makeTranscriptAgain(id: "call", request: 42)) { events.append(event) }
        let expected: String
        switch point {
        case .resolving: expected = "described: " + reason
        case .loading: expected = "«original»: " + reason
        case .hearing: expected = "«\(merged ? "later" : "original")»: " + reason
        case .publishing: expected = merged ? reason : "«original»: " + reason
        }
        #expect(events.last == .transcriptReported(request: 42, .failed(expected)))
        #expect(!events.contains(.transcriptReported(request: 42, .made)))
    }

    @Test func cancellationWhilePublishWaitsForStorageReportsStopped() async throws {
        try await withComposeFolder { root in
            let id = "1970.01.01-1000", folder = root.appendingPathComponent(id)
            try await FixtureTrack.write(far: 1, microphone: 2, seconds: 4, in: folder)
            let old = Data("old transcript".utf8), previous = Data("older previous".utf8)
            try old.write(to: folder.appendingPathComponent("transcript.md"))
            try previous.write(to: folder.appendingPathComponent("transcript-previous.md"))
            let entered = AsyncStream<Bool>.makeStream(), hold = AsyncStream<Void>.makeStream(), first = Mutex(true)
            let serial = CallsStorageGuard.serial { entered.continuation.yield($0) }
            let storage = CallsStorage(folder: root, journal: nil, readPart: { _, _ in throw POSIXError(.EIO) },
                makeCalls: { Calls(folder: $0, timeZone: .gmt, duration: TrackFile.duration(at:), transcript: transcriptLines, disk: .system) },
                operation: .init(take: { _ in
                    try await serial.take(.access)
                    if first.withLock({ let value = $0; $0 = false; return value }) { for await _ in hold.stream {} }
                }, give: serial.give))
            let listing = Task { try await storage.list() }
            var entries = entered.stream.makeAsyncIterator()
            #expect(await entries.next() == true)
            let ports = TranscriptAgainPorts(storage: storage, boundary: rehearsalBoundary(capturePersistence: .recorded,
                microphone: { throw ScriptFailure.failed }, call: { _ in throw ScriptFailure.failed },
                mine: RehearsalRecognizer(SessionRecognizer(name: "unused")), theirs: RehearsalRecognizer(SessionRecognizer(name: "unused")),
                now: { .distantPast }, timeZone: { .gmt }, sleep: { _ in throw CancellationError() },
                intervals: testIntervals, transcriptBuild: testTranscriptBuild), binding: DiskTranscriptBinding())
            let engine = ReRecognition(hear: { _, _ in .init(words: [], model: "model") }, split: { _, _ in nil }, clean: { _, _, _ in nil },
                readOld: { _ in [] }, names: ReRecognition.carryNames, publish: ports.publish)
            let running = Task { await engine.run(call: id, originals: [.init(id: id, farTrack: "far", microphoneTrack: "mic", duration: 4)],
                                                  build: .init(version: "version", number: "build"), report: { _ in }) }
            #expect(await entries.next() == false)
            running.cancel()
            #expect(await running.value == .stopped)
            hold.continuation.finish()
            _ = try await listing.value
            #expect(try Data(contentsOf: folder.appendingPathComponent("transcript.md")) == old)
            #expect(try Data(contentsOf: folder.appendingPathComponent("transcript-previous.md")) == previous)
            #expect(try FileManager.default.contentsOfDirectory(atPath: root.path) == [id])
            entered.continuation.finish()
        }
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

    @Test func aStopHandledRightAfterItsRunStopsIt() async {
        let held = AsyncStream<Void>.makeStream(), published = Values<String>()
        let chain = TranscriptAgainChain(originals: { _ in
                for await _ in held.stream {}
                try Task.checkCancellation()
                return [.init(id: "original", farTrack: "far", microphoneTrack: "mic", duration: 4)]
            },
            recognition: .init(hear: { _, _ in .init(words: [], model: "model") }, split: { _, _ in nil }, clean: { _, _, _ in nil },
                               readOld: { _ in [] }, names: ReRecognition.carryNames, publish: { id, _ in published.append(id) }),
            build: .init(version: "version", number: "number"), describe: { String(describing: $0) })
        let handler = RecordingsEffectHandler(calls: UnusedCalls(), transcriptAgain: chain, reserve: { nil }, release: { _ in },
                                              storeFolder: { _ in }, describe: { String(describing: $0) })
        let run = handler.handle(.makeTranscriptAgain(id: "call", request: 1))
        for await _ in handler.handle(.stopTranscriptAgain(id: "call", request: 1)) {}
        held.continuation.finish()
        var events: [RecordingsEvent] = []
        for await event in run { events.append(event) }
        #expect(events.last == .transcriptReported(request: 1, .stopped))
        #expect(published.all.isEmpty)
    }

    @Test(arguments: [TranscriptReport.made, .stopped, .failed("hearing failed")]) @MainActor
    func outcomesAndRepeatedRetriesSelectTheirCall(outcome: TranscriptReport) async throws {
        try await withComposeFolder { root in
            let a = "1970.01.01-1000", b = "1970.01.01-1001"
            for id in [a, b] {
                try await FixtureTrack.write(far: 1, microphone: 2, seconds: 4, in: root.appendingPathComponent(id))
                try Data("# Transcript\n\n**Me** 00:00:00\nOld words.\n".utf8).write(to: root.appendingPathComponent(id + "/transcript.md"))
            }
            let entered = AsyncStream<Void>.makeStream(), release = AsyncStream<Void>.makeStream(), first = Mutex(true)
            let recognizers = TrackRecognizers(answers: [1: [.init("New call", start: 1, end: 2)], 2: [.init("New microphone", start: 2, end: 3)]])
            let rig = try await ComposeFixture.make(root: root, configure: { boundary in
                boundary.diarizer = KeptDiarizer()
                boundary.recognizers = FixtureRecognizers(source: { side in
                    if first.withLock({ let value = $0; $0 = false; return value }) {
                        entered.continuation.yield(())
                        for await _ in release.stream {}
                        if case .failed = outcome { throw SelectionFailure() }
                    }
                    return try await recognizers.recognizer(for: side)
                }, missing: { [] }, load: { Task {} })
            })
            do {
                let calls = try #require(rig.menu.calls)
                calls.show()
                for await state in Observations({ calls.recordingsState }) where state.transcriptOffers[a]?.run == .available { break }
                await calls.send(.makeTranscriptAgain(a))
                var starts = entered.stream.makeAsyncIterator()
                _ = await starts.next()
                for await selected in Observations({ calls.state.selectedID }) where selected == a { break }
                await calls.send(.select(b))
                #expect(calls.state.selectedID == b)
                if outcome == .stopped { await calls.send(.cancelTranscriptAgain) }
                release.continuation.finish()
                for await state in Observations({ calls.recordingsState }) where state.transcriptRequest == 1 && state.transcriptRun == nil && !state.isListing { break }
                for await selected in Observations({ calls.state.selectedID }) where selected == a { break }
                for await detail in Observations({ calls.detail }) where detail?.id == a { break }
                #expect(calls.state.selectedID == a && calls.detail?.id == a)
                if case .failed = outcome {
                    #expect(calls.state.transcriptBanner?.retryID == a)
                    await calls.send(.select(b))
                    await calls.send(.retryTranscriptAgain(a))
                    for await state in Observations({ calls.recordingsState }) where state.transcriptRequest == 2 && state.transcriptRun == nil && !state.isListing { break }
                    for await selected in Observations({ calls.state.selectedID }) where selected == a { break }
                    for await detail in Observations({ calls.detail }) where detail?.id == a { break }
                    #expect(calls.recordingsState.failure == nil)
                    #expect(calls.state.selectedID == a && calls.detail?.id == a)
                }
                await rig.finish()
            } catch { release.continuation.finish(); await rig.finish(); throw error }
            entered.continuation.finish()
        }
    }

    @Test @MainActor func remakeAndRestoreRefreshTheShownDetailAndKeepTheOldBytes() async throws {
        try await withComposeFolder { root in
            let id = "1970.01.01-1000", folder = root.appendingPathComponent(id)
            try await FixtureTrack.write(far: 1, microphone: 2, seconds: 4, in: folder)
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
            let recognizers = TrackRecognizers(answers: [1: [.init("New call", start: 1, end: 1.8)], 2: [.init("New microphone", start: 2, end: 2.8)]])
            let rig = try await ComposeFixture.make(root: root, preferences: .init(automaticRecording: false, liveText: false, callsFolder: root),
                configure: { boundary in
                    boundary.recognizers = recognizers
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
                #expect(recognizers.heard.all.map(\.track) == [1, 2])
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
                try await FixtureTrack.write(far: 2 * index + 1, microphone: 2 * index + 2, seconds: 4, in: folder)
                if missing && index == 0 { try FileManager.default.removeItem(at: folder.appendingPathComponent("microphone.caf")) }
                try archived.write(to: folder.appendingPathComponent("transcript.md"))
            }
            let old = Data("# Transcript\n\n**Me** 00:00:00\nOld merged words.\n".utf8)
            try old.write(to: outer.appendingPathComponent("transcript.md"))
            try Data("Older previous".utf8).write(to: outer.appendingPathComponent("transcript-previous.md"))
            let recognizers = TrackRecognizers(answers: Dictionary(uniqueKeysWithValues: (1...6).map { tag in
                (tag, [tag.isMultiple(of: 2) ? SpeechWord("Microphone \(tag)", start: 2, end: 2.8) : SpeechWord("Call \(tag)", start: 1, end: 1.8)])
            }))
            let rig = try await ComposeFixture.make(root: root, configure: { boundary in
                boundary.recognizers = recognizers; boundary.diarizer = KeptDiarizer()
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
                    #expect(joined.segments.filter { $0.gapLength == nil }.map(\.settled)
                        == ["Call 1", "Microphone 2", "Call 3", "Microphone 4", "Call 5", "Microphone 6"])
                    #expect(recognizers.heard.all.map(\.track) == [1, 2, 3, 4, 5, 6])
                    #expect(joined.origin?.mergedBy == testTranscriptBuild.release)
                    let release = testTranscriptBuild.release
                    #expect(joined.origin?.calls.map(\.origin) == Array(repeating: .init(hearing: release,
                        mine: testTranscriptBuild.mine, theirs: testTranscriptBuild.theirs,
                        split: .done(diarizer: "nemotron", release: release),
                        cleaning: .init(outcome: .nothingKept, release: release)), count: 3))
                    #expect(joined.origin?.calls.map(\.start) == [Date(timeIntervalSince1970: 36_000), Date(timeIntervalSince1970: 36_060), Date(timeIntervalSince1970: 36_120)])
                    #expect(try Data(contentsOf: outer.appendingPathComponent("transcript-previous.md")) == old)
                    for folder in originals { #expect(try Data(contentsOf: folder.appendingPathComponent("transcript.md")) == archived) }
                }
                await rig.finish()
            } catch { await rig.finish(); throw error }
        }
    }

    @Test @MainActor func aFailedNestedOriginalKeepsThePairAndCanBeRepairedForRetry() async throws {
        try await withComposeFolder { root in
            let a = "1970.01.01-1000", b = "1970.01.01-1001", c = "1970.01.01-1002"
            let outer = root.appendingPathComponent(a), nested = outer.appendingPathComponent(a)
            let originals = [nested.appendingPathComponent(a), nested.appendingPathComponent(b), outer.appendingPathComponent(c)]
            for folder in originals { try await FixtureTrack.write(far: 1, microphone: 2, seconds: 4, in: folder) }
            let badTrack = originals[1].appendingPathComponent("call.caf"), audio = try Data(contentsOf: badTrack)
            try Data("undecodable CAF".utf8).write(to: badTrack)
            let old = Data("# Transcript\n\n**Me** 00:00:00\nOld merged words.\n".utf8), previous = Data("Previous merged words".utf8)
            try old.write(to: outer.appendingPathComponent("transcript.md"))
            try previous.write(to: outer.appendingPathComponent("transcript-previous.md"))
            let recognizers = TrackRecognizers(answers: [1: [.init("new call", start: 1, end: 2)], 2: [.init("new mic", start: 2, end: 3)]])
            let rig = try await ComposeFixture.make(root: root, configure: { boundary in
                boundary.recognizers = recognizers; boundary.diarizer = KeptDiarizer()
            })
            do {
                let calls = try #require(rig.menu.calls)
                calls.show()
                for await state in Observations({ calls.recordingsState }) where state.transcriptOffers[a]?.run == .available { break }
                await calls.send(.makeTranscriptAgain(a))
                for await state in Observations({ calls.recordingsState }) where state.failure?.kind == .transcriptRun { break }
                #expect(calls.recordingsState.failure?.reason.contains(b) == true)
                #expect(try Data(contentsOf: outer.appendingPathComponent("transcript.md")) == old)
                #expect(try Data(contentsOf: outer.appendingPathComponent("transcript-previous.md")) == previous)
                try audio.write(to: badTrack)
                await calls.send(.retryTranscriptAgain(a))
                for await state in Observations({ calls.recordingsState }) where state.transcriptChanged?.request == 2 && !state.isListing { break }
                #expect(calls.recordingsState.failure == nil)
                let saved = TranscriptFormat.read(try String(contentsOf: outer.appendingPathComponent("transcript.md"), encoding: .utf8))
                #expect(saved.origin?.calls.count == 3)
                #expect(saved.segments.filter { $0.gapLength == nil }.map(\.settled) == Array(repeating: ["new call", "new mic"], count: 3).flatMap { $0 })
                #expect(try Data(contentsOf: outer.appendingPathComponent("transcript-previous.md")) == old)
                await rig.finish()
            } catch { await rig.finish(); throw error }
        }
    }

    @Test(arguments: [false, true], [false, true]) @MainActor
    func eachNotesVersionsMarkFollowsReplacementRestoreAndRegeneration(legacy: Bool, restored: Bool) async throws {
        let recognizers = TrackRecognizers(answers: [1: [.init("New call", start: 1, end: 2)], 2: [.init("New microphone", start: 2, end: 3)]])
        try await withNotesComposition(configure: { boundary in
            boundary.recognizers = recognizers; boundary.diarizer = KeptDiarizer()
        }) { rig, http in
            let id = "1970.01.01-1000", folder = rig.root.appendingPathComponent(id)
            try await FixtureTrack.write(far: 1, microphone: 2, seconds: 4, in: folder)
            try Data("# Transcript\n\n**Me** 00:00:00\nOld words.\n".utf8).write(to: folder.appendingPathComponent("transcript.md"))
            if legacy { try Data(generatedNotes.utf8).write(to: folder.appendingPathComponent("summary.md")) }
            let calls = try #require(rig.menu.calls)
            calls.show()
            for await state in Observations({ calls.recordingsState }) where state.transcriptOffers[id]?.run == .available { break }
            await calls.send(.select(id))
            if !legacy {
                await calls.send(.makeSummary(id))
                await http.started.next()
                try await http.succeed()
            }
            for await detail in Observations({ calls.detail }) where detail?.pair != nil && detail?.progress == nil { break }
            #expect(calls.detail?.transcriptMark == nil)
            let notes = try Data(contentsOf: folder.appendingPathComponent("summary.md"))
            let requests = await http.bodies.count
            for await state in Observations({ calls.recordingsState }) where state.transcriptOffers[id]?.run == .available { break }
            await calls.send(.makeTranscriptAgain(id))
            for await state in Observations({ calls.recordingsState }) where state.transcriptChanged?.request == 1 && !state.isListing { break }
            for await detail in Observations({ calls.detail }) where detail?.transcriptMark != nil { break }
            #expect(try Data(contentsOf: folder.appendingPathComponent("summary.md")) == notes)
            #expect(await http.bodies.count == requests)
            if restored {
                await calls.send(.restorePreviousTranscript(id))
                for await state in Observations({ calls.recordingsState }) where state.transcriptChanged?.request == 2 && !state.isListing { break }
                for await detail in Observations({ calls.detail })
                where detail?.pair?.hasPreviousTranscript == true && (detail?.transcriptMark != nil) == legacy { break }
            }
            #expect((calls.detail?.transcriptMark != nil) == (legacy || !restored))
            await calls.send(detail: .makeSummaryWithTemplate("Default"))
            await http.started.next()
            #expect(await http.bodies.count == requests + 1)
            #expect(await http.bodies.last?.contains(restored ? "Old words." : "New call") == true)
            try await http.succeed()
            for await statuses in rig.menu.summaryStates() where statuses[id] == "Итоги готовы" { break }
            for await detail in Observations({ calls.detail }) where detail?.progress == nil && detail?.pair?.previous != nil && detail?.transcriptMark == nil { break }
            #expect(calls.detail?.pair?.current.transcriptIdentity == calls.detail?.pair?.currentTranscriptIdentity)
            await calls.send(detail: .chooseNotesVersion(.previous))
            for await detail in Observations({ calls.detail }) where detail?.version == .previous { break }
            #expect((calls.detail?.transcriptMark != nil) == (legacy || !restored))
            await calls.send(detail: .chooseNotesVersion(.current))
            for await detail in Observations({ calls.detail }) where detail?.version == .current { break }
            #expect(calls.detail?.transcriptMark == nil)
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

private struct SelectionFailure: Error {}
