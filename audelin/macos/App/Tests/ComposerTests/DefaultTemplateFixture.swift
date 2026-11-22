import Foundation
import NotesGeneration
import SummaryJobs
import TemplateFiles
@testable import Composer

struct TestDefaultTemplates: SummariesTemplates {
    func resolve(_ name: String) async throws -> NotesGeneration.Template { defaultJobTemplate() }
    func resolveDefault() async -> NotesGeneration.Template { defaultJobTemplate() }
}
func defaultJobTemplate() -> NotesGeneration.Template { notesTemplate(TemplateFiles.Files.builtInDefault) }
func defaultNotesPrompt() -> String {
    let request = NotesGeneration.Generator.request(lines: [], userName: nil, evidence: "", template: defaultJobTemplate())
    return String(request.dropLast("\nACCEPTED EVIDENCE:\n\nTRANSCRIPT DATA:\n".count))
}

typealias SummariesState = Composer.SummariesState
typealias SummariesEvent = Composer.SummariesEvent
typealias SummariesEffect = Composer.SummariesEffect
typealias SummariesReducer = Composer.SummariesReducer
typealias SummariesEffectHandler = Composer.SummariesEffectHandler
