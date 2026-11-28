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
            let sameMinuteID = firstID + "-2"
            var disk = CallsDisk.system
            if reopen {
                disk.rename = { source, target in
                    if source.lastPathComponent == "second", target.lastPathComponent == sameMinuteID + " Second" {
                        throw POSIXError(.EIO)
                    }
                    try CallsDisk.system.rename(source, target)
                }
            }
            let fixture = SplitFixture(root, notesOn: true, disk: disk)
            let eve = TranscriptFormat.Speaker(id: "eve", name: "Eve", state: "named")
            let ann = TranscriptFormat.Speaker(id: "ann", name: "Ann", state: "named")
            let unknown = TranscriptFormat.Segment(side: .theirs, start: 4, settled: "Unattributed words", pending: "")
            let rows = [spoken(1, "First words", speaker: eve.id), spoken(3, "Second words", speaker: ann.id), unknown]
            _ = try await call(firstID, fixture, rows: rows, speakers: [eve, ann], audio: 5)
            let reopened = SplitFixture(root, notesOn: false)
            let storage = reopen ? reopened.storage : fixture.storage
            let files = summaryFiles(storage, root: root)
            let generated = SplitGeneration()
            let model = summaryModel(storage, files: files, generation: generated)
            if !reopen {
                model.waiting(call: firstID, notesOn: true)
                for await state in Observations({ model.state }) where state.calls[firstID]?.stage == .waiting { break }
            }

            let parts: SplitReplacement
            if reopen {
                let failure = await #expect(throws: SplitRefusal.self) { try await fixture.split(firstID, at: 3) }
                guard case let .committed(replacement, _) = failure else {
                    Issue.record("Expected interruption after the first part was published")
                    return
                }
                parts = replacement
                let names = try FileManager.default.contentsOfDirectory(atPath: root.path)
                #expect(names.contains(firstID + " First"))
                #expect(!names.contains(sameMinuteID + " Second"))
                #expect(names.contains { $0.hasPrefix(".audelin-split-") })
                try await storage.restore()
            } else {
                parts = try await fixture.split(firstID, at: 3)
            }
            #expect(parts == .init(first: firstID, second: sameMinuteID))
            let ids = [parts.first, parts.second]
            let first = try #require(await files.load(call: parts.first))
            let second = try #require(await files.load(call: parts.second))
            #expect(first.phase == "pending" && second.phase == "pending" && first.job != second.job)
            let savedPart = try await storage.savedTranscript(id: parts.second)
            let secondRows = TranscriptFormat.read(String(decoding: savedPart, as: UTF8.self)).segments
            #expect(secondRows.map(\.speaker) == [ann.id, nil])
            if reopen {
                model.recover(calls: try await storage.list().map(\.id))
            } else {
                model.send(.replaced(removed: [firstID], published: ids))
            }

            for await state in Observations({ model.state }) where ids.allSatisfy({ state.calls[$0]?.stage == .succeeded }) { break }
            #expect(generated.identifications == [])
            let firstNotes = try #require(await files.notes(call: parts.first))
            let secondNotes = try #require(await files.notes(call: parts.second))
            #expect(firstNotes.text == "Them (Eve) 1.0 First words")
            #expect(secondNotes.text == "Them (Ann) 0.0 Second words\nThem 1.0 Unattributed words")
            for (id, notes) in zip(ids, [firstNotes, secondNotes]) {
                #expect(notes.transcriptIdentity == (try await storage.transcriptFacts(id: id)).identity)
            }
            await model.shutdown()

            if reopen {
                #expect(try await reopened.adapter.merge(ids: ids) == firstID)
                let transcript = try await storage.savedTranscript(id: firstID)
                let text = String(decoding: transcript, as: UTF8.self)
                let rows = TranscriptFormat.read(text).segments.filter { $0.side == .theirs }
                #expect(rows.map(\.speaker) == ["1.eve", "2.ann", nil])
                #expect(TranscriptFormat.namedEntries(text).map(\.label) == ["Them 1 (Eve)", "Them 2 (Ann)", "Them"])
            }
        }
    }

    @MainActor @Test func aMergedUnnamedSpeakerGoesThroughEnabledIdentification() async throws {
        try await withComposeFolder { root in
            let fixture = SplitFixture(root, notesOn: true)
            let speaker = TranscriptFormat.Speaker(id: "remote", name: nil, state: "unknown")
            _ = try await call(firstID, fixture, rows: [spoken(1, "First")], audio: 2)
            _ = try await call(secondID, fixture, rows: [spoken(1, "Unnamed remote", speaker: speaker.id)], speakers: [speaker], audio: 2)
            let files = summaryFiles(fixture.storage, root: root)
            let generation = SplitGeneration()
            let model = summaryModel(fixture.storage, files: files, generation: generation)

            #expect(try await fixture.adapter.merge(ids: [firstID, secondID]) == firstID)
            model.send(.replaced(removed: [firstID, secondID], published: [firstID]))
            for await state in Observations({ model.state }) where state.calls[firstID]?.stage == .succeeded { break }
            #expect(generation.identifications == [firstID])
            #expect(try await files.notes(call: firstID)?.text == "Me 1.0 First\nThem 61.0 Unnamed remote")
            await model.shutdown()
        }
    }

    @Test(arguments: [false, true])
    func anEligibleNotesWriteFailureKeepsOriginalFoldersIntact(merging: Bool) async throws {
        try await withComposeFolder { root in
            let disk = FailingPendingNotesDisk()
            let fixture = SplitFixture(root, notesOn: true, notesDisk: disk)
            let first = try await call(firstID, fixture, rows: [spoken(1, "First"), spoken(3, "Second")], audio: 5)
            var originals = [first]
            if merging { originals.append(try await call(secondID, fixture, rows: [spoken(1, "Later")], audio: 2)) }
            let before = try originals.map { try snapshot($0) }
            if merging {
                let failure = await #expect(throws: CallsFailure.self) {
                    try await fixture.adapter.merge(ids: [firstID, secondID])
                }
                guard case .mergeFailed(step: .writingTranscript, _) = failure else {
                    Issue.record("Expected merge preparation to fail")
                    return
                }
            } else {
                await #expect(throws: CocoaError(.fileWriteOutOfSpace)) {
                    try await fixture.split(firstID, at: 3)
                }
            }
            let record = try #require(disk.attempts.withLock { $0.first })
            let saved = try SummariesFilesPort.saved(record)
            #expect(saved.stage == .pending)
            #expect(saved.job.entries.first?.text == "First")
            #expect(disk.attempts.withLock { $0.count } == 1)
            #expect(try originals.map { try snapshot($0) } == before)
            #expect(Set(try FileManager.default.contentsOfDirectory(atPath: root.path)) == Set(originals.map(\.lastPathComponent)))
            #expect(Set(try await fixture.adapter.list().map(\.id)) == Set(originals.map(\.lastPathComponent)))
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

    @MainActor private func summaryModel(_ storage: CallsStorage, files: SummaryFiles.Files, generation: SplitGeneration) -> SummariesModel {
        SummariesModel(keeping: { false }, templates: TestDefaultTemplates(),
            text: { CallsListText(language: .english) },
            preparation: SummariesPreparationPort(notes: { .init(enabled: false) }, makeID: { UUID().uuidString },
                                                   callText: { try await storage.text(id: $0) }),
            files: .init(files: files, makeID: { UUID().uuidString }), generation: generation)
    }

    private func snapshot(_ folder: URL) throws -> [String: Data] {
        let files = try FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)
        return try Dictionary(uniqueKeysWithValues: files.map { ($0.lastPathComponent, try Data(contentsOf: $0)) })
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
    let disk: CallsDisk

    init(_ root: URL, notesOn: Bool, disk: CallsDisk = .system, notesDisk: any Disk = FileDisk()) {
        self.root = root
        self.disk = disk
        storage = callsStorage(folder: root, timeZone: .gmt, trash: removeForTrash, disk: disk)
        notes = replacementNotes(enabled: notesOn, disk: notesDisk)
    }

    var ports: SplitPorts {
        .init(storage: storage, calls: callsFolders(timeZone: .gmt, disk: disk, trash: removeForTrash),
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

func replacementNotes(enabled: Bool = true, disk: any Disk = FileDisk()) -> ReplacementNotes {
    .init(preferences: { .init(enabled: enabled, speakers: true) }, keeping: { true }, userName: { "Owner" },
          template: { defaultJobTemplate() },
          makeID: { UUID().uuidString }, disk: disk)
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

private final class FailingPendingNotesDisk: Disk {
    let attempts = Mutex<[SummaryFiles.Record]>([])
    private let base = FileDisk()

    func create(_ data: Data, at url: URL) throws -> Bool {
        let record = try JSONDecoder().decode(SummaryFiles.Record.self, from: data)
        attempts.withLock { $0.append(record) }
        throw CocoaError(.fileWriteOutOfSpace)
    }
    func read(_ url: URL) throws -> Data { try base.read(url) }
    func exists(_ url: URL) throws -> Bool { try base.exists(url) }
    func replace(_ data: Data, at url: URL) throws { try base.replace(data, at: url) }
    func readStamped(_ url: URL) throws -> (data: Data, modified: Date) { try base.readStamped(url) }
    func restore(_ data: Data, at url: URL, modified: Date) throws { try base.restore(data, at: url, modified: modified) }
    func remove(_ url: URL) throws { try base.remove(url) }
}
