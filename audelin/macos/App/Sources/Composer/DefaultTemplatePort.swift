import SummaryJobs
import TemplateFiles

struct DefaultTemplatePort: SummariesTemplates {
    let files: TemplateFiles.Files
    func resolveDefault() async -> SummaryJobs.Template {
        jobTemplate(files.resolveDefault())
    }
}
func jobTemplate(_ value: TemplateFiles.Template) -> SummaryJobs.Template {
    .init(name: value.name, instructions: value.instructions,
          headings: value.headings.map { $0.map { .init($0.name, required: $0.required) } })
}
