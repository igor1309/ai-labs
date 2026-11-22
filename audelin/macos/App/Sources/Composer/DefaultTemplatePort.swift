import SummaryJobs
import NotesGeneration
import TemplateFiles

struct DefaultTemplatePort: SummariesTemplates {
    let files: TemplateFiles.Files
    func resolve(_ name: String) async throws -> NotesGeneration.Template { notesTemplate(try files.resolve(name)) }
    func resolveDefault() async -> NotesGeneration.Template {
        notesTemplate(files.resolveDefault())
    }
}
func notesTemplate(_ value: TemplateFiles.Template) -> NotesGeneration.Template {
    .init(name: value.name, instructions: value.instructions,
          headings: value.headings.map { $0.map { .init($0.name, required: $0.required) } })
}

extension NotesGeneration.Template: SummariesTemplate {}
