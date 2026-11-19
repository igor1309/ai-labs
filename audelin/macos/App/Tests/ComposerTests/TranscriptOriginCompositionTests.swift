import CallDiarizer
import CallNames
import Foundation
import LiveText
import SummaryJobs
import Testing
import Synchronization
import TranscriptFile
import TranscriptFinalization
import TranscriptFormat
@testable import Composer

@MainActor @Suite(.timeLimit(.minutes(1)))
struct TranscriptOriginCompositionTests {
    @Test func liveWriteTellsTheSuppliedBuildAndBothRecognisers() async throws {
        try await withComposeFolder { root in
            let saved = Signal()
            defer { saved.end() }
            let rig = try await ComposeFixture.make(root: root, configure: { boundary in
                boundary.transcriptBuild = testTranscriptBuild
                boundary.transcripts = OriginStorage(saved: saved)
            })
            do {
                try await rig.start()
                await saved.next()
                let file = try TranscriptFormat.read(String(contentsOf: root.appendingPathComponent("1970.01.01-0000/transcript.md"), encoding: .utf8))
                #expect(file.origin == TranscriptOrigin(start: Date(timeIntervalSince1970: 0), build: testTranscriptBuild).rendering(.init()))
                await rig.finish()
            } catch { await rig.finish(); throw error }
        }
    }

    @Test(arguments: ["nemotron", "vbx"])
    func savedSplitTellsItsDiarizerWhileCleanupIsHeld(diarizer: String) async throws {
        try await withComposeFolder { root in
            let held = Signal(), release = Signal()
            defer { held.end(); release.end() }
            let rig = try await OriginRig.make(root: root, diarizer: diarizer, cleaning: {
                held.send(); await release.next(); return [0.25]
            })
            rig.close()
            await held.next()
            let saved = try rig.read()
            #expect(saved.segments.filter { $0.side == .theirs }.map(\.speaker) == ["d0", "d1"])
            #expect(saved.origin == testTranscriptOrigin.rendering(.init(split: .done(diarizer: diarizer))))
            #expect(rig.finals.all.isEmpty)
            release.send()
            await rig.published()
            #expect(try rig.read().origin == testTranscriptOrigin.rendering(.init(split: .done(diarizer: diarizer), cleaning: .done)))
            #expect(try rig.read().segments.filter { $0.side == .mine }.map(\.settled) == ["cleaned answer"])
        }
    }

    @Test(arguments: [false, true])
    func cleanupKeepingNothingCommitsRawWordsAndItsOutcome(fails: Bool) async throws {
        try await withComposeFolder { root in
            let rig = try await OriginRig.make(root: root, diarizer: nil, cleaning: {
                if fails { throw OriginFailure.failed }
                return [0.25]
            }, hearing: { _ in fails ? [originSegment("unused", start: 1)] : nil })
            rig.close()
            await rig.published()
            #expect(try rig.read().segments.filter { $0.side == .mine }.map(\.settled) == ["shared words"])
            #expect(try rig.read().origin == testTranscriptOrigin.rendering(.init(split: .nothingKept, cleaning: .nothingKept)))
            #expect(rig.replacements.all.count == 1)
        }
    }

    @Test func failedSplitKeepsTheirSideUnsplitAndTellsNothingKept() async throws {
        try await withComposeFolder { root in
            let rig = try await OriginRig.make(root: root, diarizer: nil)
            rig.close(); await rig.published()
            let saved = try rig.read()
            #expect(saved.segments.filter { $0.side == .theirs }.map(\.settled) == ["shared words", "second voice"])
            #expect(saved.segments.filter { $0.side == .theirs }.allSatisfy { $0.speaker == nil })
            #expect(saved.speakers.isEmpty)
            #expect(saved.origin == testTranscriptOrigin.rendering(.init(split: .nothingKept, cleaning: .done)))
        }
    }

    @Test func cleanupWithNoEchoKeepsRawWords() async throws {
        try await withComposeFolder { root in
            let rig = try await OriginRig.make(root: root, diarizer: nil, echo: false, cleaning: {
                Issue.record("No echo must not reach the cleaning model"); return []
            })
            rig.close(); await rig.published()
            #expect(try rig.read().segments.filter { $0.side == .mine }.map(\.settled) == ["my own answer"])
            #expect(try rig.read().origin == testTranscriptOrigin.rendering(.init(split: .nothingKept, cleaning: .nothingKept)))
        }
    }

    @Test func failedCleanupReplacementKeepsEarlierTextAndOriginTogether() async throws {
        try await withComposeFolder { root in
            let binding = OriginBinding()
            let rig = try await OriginRig.make(root: root, diarizer: "nemotron", binding: binding,
                cleaning: { binding.failRename = true; return [0.25] })
            rig.close(); await rig.published()
            #expect(try rig.read().segments.filter { $0.side == .mine }.map(\.settled) == ["shared words"])
            #expect(try rig.read().origin == testTranscriptOrigin.rendering(.init(split: .done(diarizer: "nemotron"))))
            #expect(rig.replacements.all.count == 1)
            #expect(rig.finals.all.first?.entries.filter { $0.label == "Me" }.map(\.text) == ["shared words"])
        }
    }

    enum QuitBoundary: CaseIterable { case writing, opening, diarizing, cleaning, committing }
    @Test(arguments: QuitBoundary.allCases)
    func quitCommitsTheSavedStagesAndSkipsOnlyUnfinishedWork(boundary: QuitBoundary) async throws {
        try await withComposeFolder { root in
            let entered = Signal(), release = Signal()
            defer { entered.end(); release.end() }
            let rig = try await OriginRig.make(root: root, diarizer: "nemotron", beforeDiarizing: {
                if boundary == .diarizing { entered.send(); await release.next() }
            }, cleaning: {
                if boundary == .cleaning { entered.send(); await release.next() }
                return [0.25]
            }, beforeCommit: {
                if boundary == .committing { entered.send(); await release.next() }
            }, open: boundary != .opening)
            if boundary == .writing || boundary == .opening {
                rig.model.send(.shutdown)
                for await state in rig.model.states() where state.shuttingDown { break }
                if boundary == .opening { rig.model.send(.opened(call: "call")); rig.model.send(.wrote(call: "call", rig.raw)) }
                rig.close()
            } else {
                rig.close(); await entered.next()
                rig.model.send(.shutdown)
                for await state in rig.model.states() where state.shuttingDown { break }
                if boundary != .cleaning { release.send() }
            }
            await rig.published()
            if boundary == .cleaning { release.send() }
            let split: FinishingOutcomes.Split = boundary == .writing || boundary == .opening ? .skipped : .done(diarizer: "nemotron")
            let cleaning: FinishingOutcomes.Cleaning = boundary == .committing ? .done : .skipped
            let saved = try rig.read()
            #expect(saved.origin == testTranscriptOrigin.rendering(.init(split: split, cleaning: cleaning)))
            #expect(saved.segments.filter { $0.side == .mine }.map(\.settled) == [boundary == .committing ? "cleaned answer" : "shared words"])
            #expect(rig.replacements.all.count == 1)
            rig.model.send(.inputEnded)
            await rig.model.settled()
        }
    }

    @Test(arguments: [false, true])
    func failedLatestWritePublishesEarlierWordsWithoutACommit(afterShutdown: Bool) async throws {
        try await withComposeFolder { root in
            let rig = try await OriginRig.make(root: root, diarizer: "nemotron", beforeDiarizing: {
                Issue.record("Failed latest write cannot start model work")
            }, open: !afterShutdown)
            if afterShutdown {
                rig.model.send(.shutdown)
                rig.model.send(.opened(call: "call")); rig.model.send(.wrote(call: "call", rig.raw))
            }
            let earlier = try Data(contentsOf: rig.url)
            rig.model.send(.writeFailed(call: "call")); rig.close(); await rig.published()
            #expect(try Data(contentsOf: rig.url) == earlier)
            #expect(rig.replacements.all.isEmpty)
            #expect(rig.finals.all.first?.entries.filter { $0.label == "Me" }.map(\.text) == ["shared words"])
            #expect(rig.finals.all.first?.finalWrite == false)
        }
    }
}

@MainActor private struct OriginRig {
    let model: TranscriptFinalizationModel
    let raw: CallState
    let url: URL
    let finals: Values<FinalTranscript<Job.Entry>>
    let replacements: Values<FinishingOutcomes>

    func close() { model.send(.closed(call: "call", names: .init())) }
    func published() async { for await state in model.states() where state.calls["call"]?.published == true { return } }
    func read() throws -> TranscriptFormat.Saved { TranscriptFormat.read(try String(contentsOf: url, encoding: .utf8)) }

    static func make(root: URL, diarizer: String?, binding: OriginBinding = OriginBinding(), echo: Bool = true,
                     beforeDiarizing: @escaping @Sendable () async -> Void = {},
                     cleaning: @escaping @Sendable () async throws -> [Float] = { [0.25] },
                     hearing: @escaping @Sendable ([Float]) async throws -> [TranscriptSegment]? = { _ in [originSegment("cleaned answer", start: 1)] },
                     beforeCommit: @escaping @Sendable () async -> Void = {}, open: Bool = true) async throws -> Self {
        let url = root.appendingPathComponent("transcript.md"), names = RecordingNames(), sink = FixtureLog()
        let file = try await TranscriptFile(url: url, initialBytes: [], binding: binding)
        let writer = WritingTranscript(file: file, format: TranscriptFormat(), names: names, origin: testTranscriptOrigin, sink: sink)
        let raw = try await publishedCall(status: .finished,
            mine: [.init(text: originSegment(echo ? "shared words" : "my own answer", start: 1))],
            theirs: [.init(text: originSegment("shared words", start: 0)), .init(text: originSegment("second voice", start: 2))])
        try await writer.write(raw); await writer.close()
        let replacements = Values<FinishingOutcomes>(), finals = Values<FinalTranscript<Job.Entry>>()
        let opened = OpenedTranscript(writer: OriginWriter(base: writer, before: beforeCommit, replacements: replacements),
            pass: AfterCallPass(writer: writer, track: root.appendingPathComponent("call.caf"), names: names,
                diarizer: OriginDiarizer(name: diarizer, before: beforeDiarizing), sink: sink), names: names)
        let resources = FinalizationResources()
        resources.add(call: "call", transcript: opened, cleanup: TranscriptCleanup(
            recording: .init(microphoneURL: root.appendingPathComponent("microphone.caf"), callURL: root.appendingPathComponent("call.caf")),
            duration: { 30 }, cleaning: CleaningStub(perform: cleaningIgnoringRecording(cleaning)), hearing: HearingStub(perform: hearing), sink: sink),
            speakers: { _ in }, finishReading: {})
        let model = TranscriptFinalizationModel(diarizing: FinalizationDiarizing(resources: resources), cleanup: FinalizationCleanup(resources: resources),
            replacement: FinalizationReplacement(resources: resources), finals: FinalTranscriptsPort(resources: resources, deliver: { _, final in finals.append(final) }))
        if open { model.send(.opened(call: "call")); model.send(.wrote(call: "call", raw)) }
        return .init(model: model, raw: raw, url: url, finals: finals, replacements: replacements)
    }
}

private func cleaningIgnoringRecording(_ clean: @escaping @Sendable () async throws -> [Float]) -> @Sendable (CleanupRecording) async throws -> [Float] {
    { _ in try await clean() }
}
private func originSegment(_ words: String, start: Double) -> TranscriptSegment {
    let words = words.split(separator: " ").enumerated().map { Word(String($0.element), start: start + Double($0.offset) * 0.01, end: start + Double($0.offset + 1) * 0.01) }
    return .init(id: Int(start), start: start, end: start + 0.02, words: words, settledCount: words.count)
}
private enum OriginFailure: Error { case failed }
private struct OriginDiarizer: TranscriptDiarizer {
    let name: String?
    let before: @Sendable () async -> Void
    func prepare() async {}
    func diarize(_ track: URL, speakers: Int?) async throws -> CallDiarizer.Diarization {
        await before()
        guard let name else { throw OriginFailure.failed }
        return .init(model: name == "nemotron" ? .nemotron : .vbx, turns: [.init(speaker: 0, start: 0, end: 1), .init(speaker: 1, start: 2, end: 3)])
    }
}
private struct OriginWriter: TranscriptWriter {
    let base: any TranscriptWriter
    let before: @Sendable () async -> Void
    let replacements: Values<FinishingOutcomes>
    func write(_ state: CallState) async throws { try await base.write(state) }
    func close() async { await base.close() }
    func replaceWhole(_ segments: [TranscriptFormat.Segment], speakers: [TranscriptFormat.Speaker], outcomes: FinishingOutcomes) async throws {
        replacements.append(outcomes); await before()
        try await base.replaceWhole(segments, speakers: speakers, outcomes: outcomes)
    }
}
private struct OriginStorage: TranscriptStorage {
    let saved: Signal
    func open(at url: URL, names: RecordingNames, origin: TranscriptOrigin, sink: any LogSink) async throws -> OpenedTranscript {
        let opened = try await FileTranscriptStorage(diarizer: CallDiarizer.unavailable).open(at: url, names: names, origin: origin, sink: sink)
        return .init(writer: OriginLiveWriter(base: opened.writer, saved: saved), pass: opened.pass, names: names)
    }
}
private struct OriginLiveWriter: TranscriptWriter {
    let base: any TranscriptWriter
    let saved: Signal
    func write(_ state: CallState) async throws { try await base.write(state); saved.send() }
    func close() async { await base.close() }
    func replaceWhole(_ segments: [TranscriptFormat.Segment], speakers: [TranscriptFormat.Speaker], outcomes: FinishingOutcomes) async throws {
        try await base.replaceWhole(segments, speakers: speakers, outcomes: outcomes)
    }
}

private final class OriginBinding: TranscriptFileBinding, Sendable {
    private let failure = Mutex(false)
    var failRename: Bool {
        get { failure.withLock { $0 } }
        set { failure.withLock { $0 = newValue } }
    }
    func create(at url: URL) throws -> any TranscriptFileHandle { try DiskTranscriptBinding().create(at: url) }
    func open(at url: URL) throws -> any TranscriptFileHandle { try DiskTranscriptBinding().open(at: url) }
    func rename(from source: URL, to target: URL) throws {
        if failRename { throw OriginFailure.failed }
        try DiskTranscriptBinding().rename(from: source, to: target)
    }
    func remove(at url: URL) { DiskTranscriptBinding().remove(at: url) }
}
