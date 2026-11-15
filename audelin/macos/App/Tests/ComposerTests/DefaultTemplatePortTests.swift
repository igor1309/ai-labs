import NotesGeneration
import TemplateFiles
import Testing
@testable import Composer

@Suite struct DefaultTemplatePortTests {
    @Test func fileContentMapsDirectlyToTheGenerationContract() {
        let file = TemplateFiles.Template(name: "Custom", instructions: "Write a handoff", headings: [
            [.init("Topic"), .init("Questions", required: false)],
            [.init("Тема"), .init("Вопросы", required: false)],
        ])
        #expect(notesTemplate(file) == NotesGeneration.Template(name: "Custom", instructions: "Write a handoff", headings: [
            [.init("Topic"), .init("Questions", required: false)],
            [.init("Тема"), .init("Вопросы", required: false)],
        ]))
    }
}
