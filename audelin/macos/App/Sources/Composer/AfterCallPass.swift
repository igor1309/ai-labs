import CallDiarizer
import CallNames
import Foundation
import SpeakerNaming
import TranscriptFormat

protocol WholeTranscriptReplacing: Sendable {
    func replaceWhole(_ segments: [TranscriptFormat.Segment], speakers: [TranscriptFormat.Speaker]) async throws
}

/// Gives a closed call's far side to its speakers and saves the result.
struct AfterCallPass: Sendable {
    private let writer: any WholeTranscriptReplacing
    private let track: URL?
    private let names: RecordingNames
    private let diarizer: any TranscriptDiarizer
    private let sink: any LogSink

    init(writer: any WholeTranscriptReplacing, track: URL?, names: RecordingNames, diarizer: any TranscriptDiarizer, sink: any LogSink) {
        self.writer = writer; self.track = track; self.names = names; self.diarizer = diarizer; self.sink = sink
    }

    /// A failed diarization keeps the far side plain and the live names tentative.
    func diarize(call _: String, _ state: CallState) async -> Composer.Transcript.Attributed? {

        let board = names.snapshot()
        guard let track else { return nil }

        let zoom = !board.spoken.isEmpty
        guard let result = await RemoteSpeakers(diarizer: diarizer, sink: sink).attribute(state, track: track, speakers: nil) else { return nil }
        // A pass that heard no one has nothing to confirm or attribute: the live names stay tentative.
        guard !result.turns.isEmpty else { return nil }
        var clusters: [Int: String] = [:], confirmed: [Int: String] = [:]
        if zoom {
            let rows = state.entries.filter { $0.speaker != .mine }.map { (id: $0.text.id, start: $0.text.start, end: $0.text.end) }
            let turns = result.turns.map { DiarizedTurn(speaker: $0.speaker, start: $0.start, end: $0.end) }
            let evidence = CallEvidence(roster: board.roster, spoken: board.spoken.map { .init(name: $0.name, start: $0.start, end: $0.end) },
                                        through: board.through)
            confirmed = AfterCallNames.names(rows: rows, turns: turns, evidence: evidence)
            await names.diarized(turns, rows: rows.map { Row(id: $0.id, start: $0.start, end: $0.end) })
            clusters = AfterCallNames.clusterNames(turns: turns, evidence: evidence)
            sink.write(.init(category: .session, message: "after-call names confirmed=\(clusters.count) turns=\(result.turns.count)"))
        }
        var attributed = Composer.Transcript.attributed(result.pieces, in: state, names: clusters)
        let rows = state.entries.filter { $0.speaker != .mine }.map { (id: $0.text.id, start: $0.text.start, end: $0.text.end) }
        attributed.rows = Composer.Transcript.rowSpeakers(rows: rows, turns: result.turns, speakers: attributed.speakers)
        let microphone = state.entries.filter { $0.speaker == .mine }.map { Composer.Transcript.segment(from: $0) }
        do {
            try await writer.replaceWhole(Composer.Transcript.merging(microphone, with: attributed.far), speakers: attributed.speakers)
            sink.write(.init(category: .session, message: "remote speakers saved speakers=\(attributed.speakers.count)"))
            return attributed
        } catch {
            sink.write(.init(category: .session, message: "remote speakers not saved: \(error)"))
            return zoom ? await saveConfirmedNames(state, names: board.confirming(confirmed)) : nil
        }
    }

    /// Without the attributed far side, the confirmed names still reach the file on the
    /// call's own rows, rendered afresh so rows already final take their corrected names.
    /// Once saved, those rows are the far side the pass returns.
    private func saveConfirmedNames(_ state: CallState, names board: CallNamesState) async -> Composer.Transcript.Attributed? {

        let rows = state.entries.map { entry in
            Composer.Transcript.segment(from: entry, speaker: board.rowNames[entry.text.id].flatMap { board.participantIDs[$0] })
        }
        let speakers = Composer.Transcript.speakers(board)
        do {
            try await writer.replaceWhole(rows, speakers: speakers)
            sink.write(.init(category: .session, message: "after-call names saved"))
            return .init(far: rows.filter { $0.side == .theirs }, speakers: speakers)
        } catch {
            sink.write(.init(category: .session, message: "after-call names not saved: \(error)"))
            return nil
        }
    }
}
