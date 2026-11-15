import SummaryJobs
import NotesGeneration
import TemplateFiles

struct DefaultTemplatePort: SummariesTemplates {
    let files: TemplateFiles.Files
    func resolveDefault() async -> NotesGeneration.Template {
        notesTemplate(files.resolveDefault())
    }
}
func notesTemplate(_ value: TemplateFiles.Template) -> NotesGeneration.Template {
    .init(name: value.name, instructions: value.instructions,
          headings: value.headings.map { $0.map { .init($0.name, required: $0.required) } })
}
