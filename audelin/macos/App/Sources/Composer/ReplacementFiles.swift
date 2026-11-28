import Calls
import Foundation
import NotesGeneration
import Preferences
import SummaryFiles
import SummaryJobs
import TranscriptFile
import TranscriptFormat

/// Takes a single preferences snapshot for the jobs staged by one folder transaction.
struct ReplacementNotes: Sendable {
    let preferences: @Sendable () -> NotesPreferences
    let keeping: @Sendable () -> Bool
    let userName: @Sendable () -> String?
    let template: @Sendable () -> NotesGeneration.Template
    let makeID: @Sendable () -> String
    let disk: any SummaryFiles.Disk

    func snapshot() -> @Sendable (Data, URL) throws -> Void {
        let config = preferences()
        guard config.enabled else { return { _, _ in } }
        let keeping = keeping(), userName = userName(), template = template()
        return { bytes, folder in
            let entries = storedSummaryEntries(transcriptLines(String(decoding: bytes, as: UTF8.self)))
            guard SummaryAdmission.allows(notesOn: config.enabled, finalWrite: true, usable: !entries.isEmpty, entries: entries)
            else { return }
            // The published folder supplies the job's call id when it is read.
            let submission = SummariesSubmission(call: "", entries: entries, finalWrite: true, usable: true,
                                                 transcriptIdentity: Calls.transcriptIdentity(bytes))
            var job = summaryJob(for: submission, config: config, id: makeID())
            job.speakersNamed = true
            job.keepPrevious = keeping
            job.userName = userName
            job.template = template.jobTemplate
            try SummaryFiles.Files.stagePending(SummariesFilesPort.record(job, phase: "pending"), in: folder, disk: disk)
        }
    }
}

func writeReplacementTranscript(_ bytes: Data, in folder: URL, binding: any TranscriptFileBinding) throws {
    let url = folder.appendingPathComponent("transcript.md")
    let file = try binding.create(at: url)
    do {
        try file.write(bytes)
        try file.flush()
    } catch {
        binding.remove(at: url)
        throw error
    }
}
