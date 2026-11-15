import Foundation
import NotesGeneration
import SummaryJobs
import TemplateFiles
@testable import Composer

struct TestDefaultTemplates: SummariesTemplates {
    func resolveDefault() async -> SummaryJobs.Template { defaultJobTemplate() }
}
func defaultJobTemplate() -> SummaryJobs.Template { jobTemplate(TemplateFiles.Files.builtInDefault) }
func defaultNotesPrompt() -> String {
    let request = NotesGeneration.Generator.request(transcript: "", evidence: "", template: notesTemplate(defaultJobTemplate()))
    return String(request.dropLast("\nACCEPTED EVIDENCE:\n\nTRANSCRIPT DATA:\n".count))
}
