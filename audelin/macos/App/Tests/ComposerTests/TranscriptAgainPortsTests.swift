import CallDiarizer
@testable import Calls
import CallsStorage
import TranscriptFile
import Foundation
import LiveText
import Recordings
import SessionRehearsal
import Testing
import TrackFile
import TranscriptFormat
@testable import Composer

/// The kept-call ports as production composes them: each track's own audio reaches its
/// recogniser, and the split and cleanup steps get and give what a live call's finishing does.
@Suite(.timeLimit(.minutes(1)))
struct TranscriptAgainPortsTests {
    @Test func originalDiscoveryUsesTheStoresInjectedDisk() async throws {
        try await withComposeFolder { root in
            let id = "1970.01.01-1000", folder = root.appendingPathComponent(id)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let sample = root.appendingPathComponent("sample")
            try Data().write(to: sample)
            var disk = CallsDisk.system
            disk.values = { url in
                try CallsDisk.system.values(url.pathExtension == "caf" ? sample : url)
            }
            let storage = CallsStorage(folder: root, journal: nil, readPart: { _, _ in throw ScriptFailure.failed },
                makeCalls: { [disk] in Calls(folder: $0, timeZone: .gmt, duration: { _ in 7 }, transcript: transcriptLines, disk: disk) })
            let boundary = rehearsalBoundary(capturePersistence: .recorded,
                microphone: { throw ScriptFailure.failed }, call: { _ in throw ScriptFailure.failed },
                mine: RehearsalRecognizer(SessionRecognizer(name: "unused")), theirs: RehearsalRecognizer(SessionRecognizer(name: "unused")),
                now: { .distantPast }, timeZone: { .gmt }, sleep: { _ in throw CancellationError() },
                intervals: testIntervals, transcriptBuild: testTranscriptBuild)
            let ports = TranscriptAgainPorts(storage: storage, boundary: boundary, binding: DiskTranscriptBinding())
            let originals = try await ports.originals(id)
            #expect(originals.count == 1)
            let original = try #require(originals.first)
            #expect(original.id == id)
            #expect(original.duration == 7)
            #expect(original.start == 0)
            let far = URL(fileURLWithPath: original.farTrack), microphone = URL(fileURLWithPath: original.microphoneTrack)
            #expect(far.lastPathComponent == "call.caf")
            #expect(microphone.lastPathComponent == "microphone.caf")
            #expect(far.deletingLastPathComponent().resolvingSymlinksInPath().path == folder.resolvingSymlinksInPath().path)
            #expect(microphone.deletingLastPathComponent().resolvingSymlinksInPath().path == folder.resolvingSymlinksInPath().path)
        }
    }

    @Test(arguments: [CallDiarizer.Model.nemotron, .vbx])
    func splitAndCleanRebuildTheCallInSpeakerTurns(model: CallDiarizer.Model) async throws {
        try await withComposeFolder { root in
            let id = "1970.01.01-1000", folder = root.appendingPathComponent(id)
            try await FixtureTrack.write(far: 1, microphone: 2, seconds: 8, in: folder)
            try oldTranscript.write(to: folder.appendingPathComponent("transcript.md"))
            let recognizers = TrackRecognizers(answers: [
                1: [.init("alpha", start: 1, end: 1.5), .init("bravo", start: 1.6, end: 2), .init("again", start: 2.2, end: 2.7),
                    .init("stray", start: 6, end: 6.4)],
                // The microphone heard the far side's first two words: bleed the gate cleans.
                2: [.init("alpha", start: 1.05, end: 1.5), .init("bravo", start: 1.65, end: 2), .init("mine", start: 4, end: 4.4)],
            ])
            let diarized = Values<DiarizedTrack>(), cleaned = Values<CleanupRecording>(), heard = Values<[Float]>()
            let chain = transcriptAgain(root: root, recognizers: recognizers, diarizer: TrackDiarizer(model: model, calls: diarized) { _ in
                [.init(speaker: 0, start: 0.8, end: 1.55), .init(speaker: 1, start: 1.55, end: 2.1), .init(speaker: 0, start: 2.1, end: 2.8)]
            }, cleaning: { cleaned.append($0); return [0.5, -0.25] }, hearing: { samples in
                heard.append(samples)
                return [.init(id: 0, start: 4, end: 4.8, words: [Word("clean", start: 4, end: 4.3), Word("answer", start: 4.4, end: 4.8)], settledCount: 2)]
            })

            #expect(try await reports(chain.run(id: id, request: 1)).last == .made)

            let saved = TranscriptFormat.read(try String(contentsOf: folder.appendingPathComponent("transcript.md"), encoding: .utf8))
            let rows = saved.segments.filter { $0.gapLength == nil }
            #expect(rows.map { Row($0) } == [
                .init(.theirs, "alpha", "1.0"), .init(.theirs, "bravo", "1.1"), .init(.theirs, "again", "1.0"),
                .init(.mine, "clean answer", nil), .init(.theirs, "stray", "1.0"),
            ])
            #expect(rows.map(\.start) == [1, 1, 2, 4, 6])
            // The join names each speaker within its original: original 1, speakers 0 and 1.
            #expect(saved.speakers.map(\.id) == ["1.0", "1.1"])
            let release = TranscriptFormat.Release(version: testTranscriptBuild.release.version, build: testTranscriptBuild.release.build)
            #expect(saved.origin?.calls.first?.origin == .init(hearing: release, mine: testTranscriptBuild.mine, theirs: testTranscriptBuild.theirs,
                split: .done(diarizer: model == .nemotron ? "nemotron" : "vbx", release: release),
                cleaning: .init(outcome: .done, release: release)))
            let kept = folder.resolvingSymlinksInPath()
            #expect(diarized.all == [.init(track: kept.appendingPathComponent("call.caf").path, speakers: nil)])
            #expect(cleaned.all.map { [$0.microphoneURL.resolvingSymlinksInPath().path, $0.callURL.resolvingSymlinksInPath().path] }
                == [[kept.appendingPathComponent("microphone.caf").path, kept.appendingPathComponent("call.caf").path]])
            #expect(heard.all == [[0.5, -0.25]])
            #expect(recognizers.heard.all.map(\.side) == [.call, .microphone])
            #expect(recognizers.heard.all.map(\.track) == [1, 2])
            #expect(recognizers.heard.all.map(\.rates) == [[48_000], [48_000]])
        }
    }

    @Test func eachOriginalIsHeardWholeInOrderAndPlacedAtItsOffset() async throws {
        try await withComposeFolder { root in
            let id = "1970.01.01-1000", outer = root.appendingPathComponent(id)
            try await FixtureTrack.write(far: 3, microphone: 4, seconds: 8, in: outer.appendingPathComponent(id))
            try await FixtureTrack.write(far: 5, microphone: 6, seconds: 8, in: outer.appendingPathComponent("1970.01.01-1001"))
            try oldTranscript.write(to: outer.appendingPathComponent("transcript.md"))
            let recognizers = TrackRecognizers(answers: [
                3: [.init("far3", start: 1, end: 1.5)], 4: [.init("mic4", start: 3, end: 3.5)],
                5: [.init("far5", start: 1, end: 1.5)], 6: [.init("mic6", start: 3, end: 3.5)],
            ])
            let diarized = Values<DiarizedTrack>(), cleaned = Values<CleanupRecording>()
            let chain = transcriptAgain(root: root, recognizers: recognizers, diarizer: TrackDiarizer(model: .nemotron, calls: diarized) { _ in
                [.init(speaker: 0, start: 0, end: 8)]
            }, cleaning: { cleaned.append($0); return [] }, hearing: { _ in nil })

            #expect(try await reports(chain.run(id: id, request: 1)).last == .made)

            let saved = TranscriptFormat.read(try String(contentsOf: outer.appendingPathComponent("transcript.md"), encoding: .utf8))
            let rows = saved.segments.filter { $0.gapLength == nil }
            #expect(rows.map { Row($0) } == [.init(.theirs, "far3", "1.0"), .init(.mine, "mic4", nil), .init(.theirs, "far5", "2.0"), .init(.mine, "mic6", nil)])
            #expect(rows.map(\.start) == [1, 3, 61, 63])
            #expect(recognizers.heard.all.map(\.side) == [.call, .microphone, .call, .microphone])
            #expect(recognizers.heard.all.map(\.track) == [3, 4, 5, 6])
            #expect(diarized.all.map { URL(fileURLWithPath: $0.track).deletingLastPathComponent().lastPathComponent } == [id, "1970.01.01-1001"])
            #expect(cleaned.all.isEmpty)
        }
    }

    enum Ambiguity: CaseIterable { case equal, unequal, twoNames }

    @Test(arguments: Ambiguity.allCases)
    func ambiguousOldNamesStayUnnamedInThePublishedTranscript(ambiguity: Ambiguity) async throws {
        try await withComposeFolder { root in
            let id = "1970.01.01-1000", folder = root.appendingPathComponent(id)
            try await FixtureTrack.write(far: 1, microphone: 2, seconds: 10, in: folder)
            var format = TranscriptFormat()
            var rows = [TranscriptFormat.Segment(side: .theirs, start: 0, settled: "old A", pending: "", speaker: "a")]
            if ambiguity == .twoNames { rows.append(.init(side: .theirs, start: 2, settled: "old B", pending: "", speaker: "b")) }
            rows.append(.init(side: .mine, start: 4, settled: "old microphone", pending: ""))
            let old = try format.render(rows, speakers: [.init(id: "a", name: "Ada", state: "confirmed"), .init(id: "b", name: "Bea", state: "confirmed")]).chunks.reduce(Data(), +)
            try old.write(to: folder.appendingPathComponent("transcript.md"))
            let words: [SpeechWord]
            let turns: [CallDiarizer.Turn]
            switch ambiguity {
            case .equal:
                words = [.init("first", start: 0, end: 2), .init("second", start: 2, end: 4)]
                turns = [.init(speaker: 0, start: 0, end: 2), .init(speaker: 1, start: 2, end: 4)]
            case .unequal:
                words = [.init("first", start: 0, end: 2.5), .init("second", start: 2.5, end: 4), .init("again", start: 5, end: 10)]
                turns = [.init(speaker: 0, start: 0, end: 2.5), .init(speaker: 1, start: 2.5, end: 4), .init(speaker: 0, start: 5, end: 10)]
            case .twoNames:
                words = [.init("one", start: 0, end: 4)]
                turns = [.init(speaker: 0, start: 0, end: 4)]
            }
            let chain = transcriptAgain(root: root, recognizers: TrackRecognizers(answers: [1: words, 2: []]),
                diarizer: TrackDiarizer(model: .nemotron, calls: Values(), turns: { _ in turns }), cleaning: { _ in [] }, hearing: { _ in nil })
            #expect(await reports(chain.run(id: id, request: 1)).last == .made)
            let saved = TranscriptFormat.read(try String(contentsOf: folder.appendingPathComponent("transcript.md"), encoding: .utf8))
            #expect(!saved.speakers.isEmpty && saved.speakers.allSatisfy { $0.name == nil })
            #expect(saved.segments.filter { $0.side == .theirs }.map(\.settled).joined(separator: " ") == words.map(\.text).joined(separator: " "))
        }
    }

    private let oldTranscript = Data("# Transcript\n\n**Me** 00:00:00\nOld words.\n".utf8)

    private struct Row: Equatable {
        let side: TranscriptFormat.Segment.Side, text: String, speaker: String?
        init(_ side: TranscriptFormat.Segment.Side, _ text: String, _ speaker: String?) { self.side = side; self.text = text; self.speaker = speaker }
        init(_ segment: TranscriptFormat.Segment) { self.init(segment.side, segment.settled, segment.speaker) }
    }

    private func transcriptAgain(root: URL, recognizers: TrackRecognizers, diarizer: TrackDiarizer,
                                 cleaning: @escaping @Sendable (CleanupRecording) async throws -> [Float],
                                 hearing: @escaping @Sendable ([Float]) async throws -> [TranscriptSegment]?) -> TranscriptAgainChain {
        var boundary = rehearsalBoundary(capturePersistence: .recorded,
            microphone: { throw ScriptFailure.failed }, call: { _ in throw ScriptFailure.failed },
            mine: RehearsalRecognizer(SessionRecognizer(name: "unused")), theirs: RehearsalRecognizer(SessionRecognizer(name: "unused")),
            now: { Date(timeIntervalSince1970: 0) }, timeZone: { .gmt }, sleep: { _ in throw CancellationError() },
            intervals: testIntervals, transcriptBuild: testTranscriptBuild)
        boundary.recognizers = recognizers
        boundary.diarizer = diarizer
        boundary.bleedCleaning = CleaningStub(perform: cleaning)
        boundary.bleedHearing = HearingStub(perform: hearing)
        boundary.log = FixtureLog()
        return Composer.transcriptAgain(storage: callsStorage(folder: root, timeZone: .gmt, trash: removeForTrash), boundary: boundary,
                                        describe: { String(describing: $0) })
    }

    private func reports(_ stream: AsyncStream<TranscriptReport>) async -> [TranscriptReport] {
        var reports: [TranscriptReport] = []
        for await report in stream { reports.append(report) }
        return reports
    }
}

/// Fixture tracks whose every sample says which track it is, so a recogniser can tell it
/// heard one whole track: sample `i` of track `tag` is `(tag * 1024 + i % 1024) / 32768`,
/// which the 16-bit track file keeps exactly.
enum FixtureTrack {
    static let rate = 48_000.0

    static func samples(_ tag: Int, count: Int) -> [Float] { (0..<count).map { Float(tag * 1024 + $0 % 1024) / 32768 } }

    static func write(far: Int, microphone: Int, seconds: Int, in folder: URL) async throws {
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        for (name, tag) in [("call", far), ("microphone", microphone)] {
            let track = try await TrackFile(url: folder.appendingPathComponent(name + ".caf"))
            try await track.write(samples(tag, count: seconds * Int(rate)), sampleRate: rate)
            try await track.close()
        }
    }

    /// The track these samples are, whole and in order, or nil when they are not one.
    static func tag(of samples: [Float]) -> Int? {
        guard let first = samples.first, samples.count.isMultiple(of: Int(rate)) else { return nil }
        let tag = Int((first * 32768).rounded()) / 1024
        return samples == Self.samples(tag, count: samples.count) ? tag : nil
    }
}

/// Recognisers that answer only for a whole fixture track, with that track's words.
struct TrackRecognizers: RecognizerSource {
    struct Heard: Equatable, Sendable {
        let side: ComposerSide
        /// The fixture track heard whole, or nil when the audio was not one track.
        let track: Int?
        let rates: Set<Double>
    }

    let answers: [Int: [SpeechWord]]
    let heard = Values<Heard>()

    func recognizer(for side: ComposerSide) async throws -> any SpeechRecognizer {
        TrackRecognizer(side: side, answers: answers, heard: heard)
    }
    func missingModels() -> [String] { [] }
    func startLoading() -> Task<Void, any Error> { Task {} }
}

private actor TrackRecognizer: SpeechRecognizer {
    let side: ComposerSide
    let answers: [Int: [SpeechWord]]
    let heard: Values<TrackRecognizers.Heard>
    private var samples: [Float] = []
    private var rates: Set<Double> = []

    init(side: ComposerSide, answers: [Int: [SpeechWord]], heard: Values<TrackRecognizers.Heard>) {
        self.side = side; self.answers = answers; self.heard = heard
    }

    func hear(_ chunk: SpeechAudio) async throws -> SpeechHearing {
        samples += chunk.samples
        rates.insert(chunk.sampleRate)
        return .init(words: [])
    }

    func finish() async throws -> SpeechHearing {
        let track = FixtureTrack.tag(of: samples)
        heard.append(.init(side: side, track: track, rates: rates))
        return .init(words: track.flatMap { answers[$0] } ?? [], finalThrough: Double(samples.count) / FixtureTrack.rate)
    }
}

struct DiarizedTrack: Equatable, Sendable { let track: String; let speakers: Int? }

struct TrackDiarizer: TranscriptDiarizer {
    let model: CallDiarizer.Model
    let calls: Values<DiarizedTrack>
    let turns: @Sendable (URL) async throws -> [CallDiarizer.Turn]

    func prepare() async {}
    func diarize(_ track: URL, speakers: Int?) async throws -> CallDiarizer.Diarization {
        calls.append(.init(track: track.resolvingSymlinksInPath().path, speakers: speakers))
        return .init(model: model, turns: try await turns(track))
    }
}
