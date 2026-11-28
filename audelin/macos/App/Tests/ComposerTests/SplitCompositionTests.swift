import Calls
import CallsListUI
import CallsStorage
import Foundation
import NotesGeneration
import Observation
import Recordings
import SummaryFiles
import SummaryJobs
import Synchronization
import TagsFile
import Testing
import TrackFile
import TranscriptFile
import TranscriptFormat
@testable import Composer

@Suite(.timeLimit(.minutes(1)))
struct SplitCompositionTests {
    private let firstID = "1970.01.01-1000"
    private let secondID = "1970.01.01-1001"
    private let start = Date(timeIntervalSince1970: 36_000)

    @Test func splitsTheTranscriptSpeakersTracksAndTagsThenMergesAtTheExactCut() async throws {
        try await withComposeFolder { root in
            let fixture = SplitFixture(root, notesOn: false)
            let ann = TranscriptFormat.Speaker(id: "ann", name: "Ann", state: "named")
            let kay = TranscriptFormat.Speaker(id: "kay", name: "Kay", state: "named")
            let rows = [spoken(2, "Goodbye", speaker: ann.id), spoken(67, "Hello everyone", speaker: kay.id),
                        spoken(75, "One more thing", speaker: kay.id)]
            let folder = try await call(firstID, fixture, rows: rows, speakers: [ann, kay], audio: 80)
            try TagsFile.write(["client", "planning"], in: folder)

            let handler = fixture.handler
            var choices = handler.handle(.readSplitChoices(id: firstID, request: 7)).makeAsyncIterator()
            let choicesEvent = await choices.next()
            guard case let .splitChoicesRead(id, request, .success(result)) = choicesEvent else {
                Issue.record("Unexpected choices result: \(String(describing: choicesEvent))")
                return
            }
            #expect(id == firstID && request == 7)
            #expect(result.transcriptIdentity == (try await fixture.storage.transcriptFacts(id: firstID)).identity)
            #expect(result.choices.first == .init(before: "Goodbye", after: "Hello everyone", cut: 67, gap: 65,
                                                 suggestsTransition: true, secondPartMinute: start.addingTimeInterval(60),
                                                 beforeSpeaker: "Them 1 (Ann)", afterSpeaker: "Them 2 (Kay)"))
            var split = handler.handle(.split(.init(id: firstID, transcriptIdentity: result.transcriptIdentity, cut: 67,
                                                      firstTitle: "First", secondTitle: "Second"))).makeAsyncIterator()
            #expect(await split.next() == .splitFinished(.success(.init(first: firstID, second: secondID))))

            let listed = try await fixture.adapter.list()
            #expect(listed.map(\.title) == ["Second", "First"])
            #expect(listed.map(\.tags) == [.known(["client", "planning"]), .known(["client", "planning"])])
            let first = try await fixture.transcript(firstID), second = try await fixture.transcript(secondID)
            #expect(first.origin?.timelineStart == start)
            #expect(second.origin?.timelineStart == start.addingTimeInterval(67))
            #expect(first.segments == [rows[0]] && first.speakers == [ann])
            #expect(second.segments == [spoken(0, "Hello everyone", speaker: kay.id), spoken(8, "One more thing", speaker: kay.id)])
            #expect(second.speakers == [kay])
            let firstAudio = try #require(await fixture.storage.originals(id: firstID).first)
            let secondAudio = try #require(await fixture.storage.originals(id: secondID).first)
            #expect(firstAudio.start == start && firstAudio.duration == 67)
            #expect(secondAudio.start == start.addingTimeInterval(67) && secondAudio.duration == 13)
            #expect(try TrackFile.duration(at: firstAudio.callTrack) == 67)
            #expect(try TrackFile.duration(at: secondAudio.microphoneTrack) == 13)
            #expect(try await summaryFiles(fixture.storage, root: root).load(call: firstID) == nil)
            #expect(try await summaryFiles(fixture.storage, root: root).load(call: secondID) == nil)

            #expect(try await fixture.adapter.merge(ids: [secondID, firstID]) == firstID)
            let merged = try await fixture.transcript(firstID)
            #expect(merged.origin?.timelineStart == start)
            #expect(merged.segments.filter { $0.side != .gap }.map(\.start) == rows.map(\.start))
            #expect(merged.segments.filter { $0.side != .gap }.map(\.settled) == rows.map(\.settled))
            #expect(merged.segments.filter { $0.side == .gap } == [.gap(at: 67, length: 0)])
        }
    }

    @Test func cuttingAtAnExistingAudioGapPreservesTheOriginalsAcrossARemerge() async throws {
        try await withComposeFolder { root in
            let fixture = SplitFixture(root, notesOn: false)
            _ = try await call(firstID, fixture, rows: [spoken(2, "First")], audio: 20)
            _ = try await call(secondID, fixture, rows: [spoken(1, "An excerpt"), spoken(7, "Second"), spoken(12, "Still second")], audio: 20)
            let excerpt = try await fixture.split(secondID, at: 7)
            #expect(try await fixture.adapter.merge(ids: [firstID, excerpt.second]) == firstID)

            let original = try await fixture.transcript(firstID)
            #expect(original.segments.map(\.start) == [2, 20, 67, 72])
            let baseline = try await fixture.storage.originals(id: firstID)
            #expect(baseline.map(\.start) == [start, start.addingTimeInterval(67)])
            #expect(baseline.map(\.duration) == [20, 13])
            let parts = try await fixture.split(firstID, at: 67)
            #expect(try await fixture.transcript(parts.second).segments.map(\.start) == [0, 5])
            #expect(try await fixture.storage.originals(id: parts.first).map(\.start) == [start])
            #expect(try await fixture.storage.originals(id: parts.second).map(\.start) == [start.addingTimeInterval(67)])

            #expect(try await fixture.adapter.merge(ids: [parts.second, parts.first]) == firstID)
            let remerged = try await fixture.transcript(firstID)
            #expect(remerged.segments == original.segments)
            let audio = try await fixture.storage.originals(id: firstID)
            #expect(audio.map(\.start) == baseline.map(\.start))
            #expect(audio.map(\.duration) == baseline.map(\.duration))
        }
    }

    @MainActor @Test(arguments: [false, true])
    func stagedPartJobsUseOnlyTheirSavedNamedEntries(reopen: Bool) async throws {
        try await withComposeFolder { root in
            let fixture = SplitFixture(root, notesOn: true)
            let ann = TranscriptFormat.Speaker(id: "ann", name: "Ann", state: "named")
            let rows = [spoken(1, "First words", speaker: ann.id), spoken(3, "Second words", speaker: ann.id)]
            _ = try await call(firstID, fixture, rows: rows, speakers: [ann], audio: 5)
            let storage = reopen ? SplitFixture(root, notesOn: false).storage : fixture.storage
            let files = summaryFiles(storage, root: root)
            let generated = SplitGeneration()
            let model = SummariesModel(keeping: { false }, templates: TestDefaultTemplates(),
                text: { CallsListText(language: .english) },
                preparation: SummariesPreparationPort(notes: { .init(enabled: false) }, makeID: { UUID().uuidString },
                                                       callText: { try await storage.text(id: $0) }),
                files: .init(files: files, makeID: { UUID().uuidString }), generation: generated)
            if !reopen {
                model.waiting(call: firstID, notesOn: true)
                for await state in Observations({ model.state }) where state.calls[firstID]?.stage == .waiting { break }
            }

            let parts = try await fixture.split(firstID, at: 3)
            let ids = [parts.first, parts.second]
            let stagedFiles = summaryFiles(fixture.storage, root: root)
            let first = try #require(await stagedFiles.load(call: parts.first))
            let second = try #require(await stagedFiles.load(call: parts.second))
            #expect(first.phase == "pending" && second.phase == "pending" && first.job != second.job)
            if reopen {
                try await storage.restore()
                model.recover(calls: try await storage.list().map(\.id))
            } else {
                model.send(.replaced(removed: [firstID], published: ids))
            }

            for await state in Observations({ model.state }) where ids.allSatisfy({ state.calls[$0]?.stage == .succeeded }) { break }
            #expect(generated.identifications == [])
            let firstNotes = try #require(await files.notes(call: parts.first))
            let secondNotes = try #require(await files.notes(call: parts.second))
            #expect(firstNotes.text == "Them (Ann) 1.0 First words")
            #expect(secondNotes.text == "Them (Ann) 0.0 Second words")
            for (id, notes) in zip(ids, [firstNotes, secondNotes]) {
                #expect(notes.transcriptIdentity == (try await storage.transcriptFacts(id: id)).identity)
            }
            await model.shutdown()
        }
    }

    @Test func changedTranscriptAndInvalidChoiceLeaveTheOriginalInPlace() async throws {
        try await withComposeFolder { root in
            let fixture = SplitFixture(root, notesOn: true)
            let rows = [spoken(1, "First"), spoken(3, "Second")]
            let folder = try await call(firstID, fixture, rows: rows, audio: 5)
            let choices = try await fixture.ports.splitChoices(id: firstID)
            await #expect(throws: SplitRefusal.invalidChoice) {
                _ = try await fixture.ports.split(.init(id: firstID, transcriptIdentity: choices.transcriptIdentity,
                                                         cut: 2, firstTitle: "One", secondTitle: "Two"))
            }
            let changed = [rows[0], spoken(3, "Changed second")]
            try write(changed, in: folder)
            await #expect(throws: SplitRefusal.expiredTranscript) {
                _ = try await fixture.ports.split(.init(id: firstID, transcriptIdentity: choices.transcriptIdentity,
                                                         cut: 3, firstTitle: "One", secondTitle: "Two"))
            }
            #expect(try await fixture.adapter.list().map(\.id) == [firstID])
            #expect(try await fixture.transcript(firstID).segments == changed)
            #expect(try await summaryFiles(fixture.storage, root: root).load(call: firstID) == nil)
        }
    }

    private func call(_ id: String, _ fixture: SplitFixture, rows: [TranscriptFormat.Segment],
                      speakers: [TranscriptFormat.Speaker] = [], audio: Int) async throws -> URL {
        let folder = fixture.root.appendingPathComponent(id)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false)
        try write(rows, speakers: speakers, in: folder)
        for filename in ["call.caf", "microphone.caf"] {
            let track = try await TrackFile(url: folder.appendingPathComponent(filename))
            let samples = [Float](repeating: 0.125, count: Int(TrackFile.sampleRate))
            for _ in 0..<audio { try await track.write(samples, sampleRate: TrackFile.sampleRate) }
            try await track.close()
        }
        return folder
    }

    private func write(_ rows: [TranscriptFormat.Segment], speakers: [TranscriptFormat.Speaker] = [], in folder: URL) throws {
        var format = TranscriptFormat()
        let bytes = try format.render(rows, speakers: speakers).chunks.reduce(into: Data()) { $0.append($1) }
        try bytes.write(to: folder.appendingPathComponent("transcript.md"), options: .atomic)
    }

    private func spoken(_ start: Double, _ words: String, speaker: String? = nil) -> TranscriptFormat.Segment {
        .init(side: speaker == nil ? .mine : .theirs, start: start, settled: words, pending: "", speaker: speaker)
    }
}

private struct SplitFixture {
    let root: URL
    let storage: CallsStorage
    let notes: ReplacementNotes

    init(_ root: URL, notesOn: Bool) {
        self.root = root
        storage = callsStorage(folder: root, timeZone: .gmt, trash: removeForTrash)
        notes = replacementNotes(enabled: notesOn)
    }

    var ports: SplitPorts {
        .init(storage: storage, calls: callsFolders(timeZone: .gmt, disk: .system, trash: removeForTrash),
              binding: DiskTranscriptBinding(), notes: notes)
    }

    var adapter: SummaryCalls {
        .init(storage: storage, release: testTranscriptBuild.release, deleted: { _ in }, notes: notes)
    }

    var handler: RecordingsEffectHandler {
        .init(calls: adapter, split: ports, transcriptAgain: UnexpectedTranscriptAgain(), reserve: { nil },
              release: { _ in }, storeFolder: { _ in }, describe: { $0.localizedDescription })
    }

    func split(_ id: String, at cut: Int) async throws -> SplitReplacement {
        let choices = try await ports.splitChoices(id: id)
        return try await ports.split(.init(id: id, transcriptIdentity: choices.transcriptIdentity, cut: cut,
                                           firstTitle: "First", secondTitle: "Second"))
    }

    func transcript(_ id: String) async throws -> TranscriptFormat.Saved {
        TranscriptFormat.read(String(decoding: try await storage.savedTranscript(id: id), as: UTF8.self))
    }
}

func summaryFiles(_ storage: CallsStorage, root: URL) -> SummaryFiles.Files {
    .init(locations: storage, disk: SummaryFiles.FileDisk(), ownershipDirectory: root.appendingPathComponent("ownership"))
}

func replacementNotes(enabled: Bool = true) -> ReplacementNotes {
    .init(preferences: { .init(enabled: enabled, speakers: true) }, keeping: { true }, userName: { "Owner" },
          template: { defaultJobTemplate() },
          makeID: { UUID().uuidString }, disk: SummaryFiles.FileDisk())
}

private final class SplitGeneration: SummariesGeneration {
    private let identified = Mutex<[String]>([])
    var identifications: [String] { identified.withLock { $0 } }

    func identify(_ job: Job) async throws -> [Identity] {
        identified.withLock { $0.append(job.call) }
        return []
    }

    func notes(_ job: Job, identities: [Identity], template: NotesGeneration.Template) async throws -> String {
        job.entries.map { "\($0.label) \($0.time) \($0.text)" }.joined(separator: "\n")
    }

    func cancel(_ job: Job) async {}
}
