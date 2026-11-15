import Foundation
import TemplateFiles
import Testing

@Suite struct TemplateFilesTests {
    @Test func firstListingWritesDefaultAndAnExistingFolderIsNeverReplenished() throws {
        try withFolder { root in
            let folder = root.appendingPathComponent("Templates")
            let sut = Files(folder: folder, disk: FileDisk())
            let catalogue = sut.list()
            #expect(catalogue == Catalogue(entries: [Entry(name: "Default", file: "Default.md", reason: nil)], folderReason: nil))
            #expect(try Files.parse(String(contentsOf: folder.appendingPathComponent("Default.md"), encoding: .utf8)) == Files.builtInDefault)
            try FileManager.default.removeItem(at: folder.appendingPathComponent("Default.md"))
            #expect(sut.list().entries == [Entry(name: "Default", file: nil, reason: nil)])
            #expect(try FileManager.default.contentsOfDirectory(atPath: folder.path).isEmpty)
            #expect(try sut.resolve("Default") == Files.builtInDefault)
            let fallback = sut.resolveDefault()
            #expect(fallback.headings.map { $0.filter(\.required).map(\.name) } == [
                ["What this was about", "Key points", "Decisions", "Actions"],
                ["О чём встреча", "Ключевые моменты", "Решения", "Задачи"],
            ])
            #expect(fallback.headings.map { $0.filter { !$0.required }.map(\.name) } == [["Open questions"], ["Открытые вопросы"]])
            #expect(fallback.instructions.contains("Each action names the"))
            #expect(try FileManager.default.contentsOfDirectory(atPath: folder.path).isEmpty)
        }
    }
    @Test func anExistingFolderIsNotReplenished() throws {
        try withFolder { root in
            let sut = Files(folder: root, disk: FileDisk())
            try Files.encode(Files.builtInDefault).write(to: root.appendingPathComponent("Default.md"), atomically: true, encoding: .utf8)
            #expect(sut.list().entries.map(\.name) == ["Default"])
            #expect(try FileManager.default.contentsOfDirectory(atPath: root.path) == ["Default.md"])
        }
    }
    @Test func validFilesAndEditsResolveTheirWholeContract() throws {
        try withFolder { root in
            let sut = Files(folder: root, disk: FileDisk())
            for name in ["Default", "Custom"] {
                let template = Template(name: name, instructions: "Write the marker \(name)", headings: [[Heading("Topic"), Heading("Questions", required: false), Heading("Actions")]])
                let file = root.appendingPathComponent(name + ".md")
                try Files.encode(template).write(to: file, atomically: true, encoding: .utf8)
                #expect(try sut.resolve(name) == template)
                var edited = template; edited.instructions = "Edited instructions for \(name)"
                try Files.encode(edited).write(to: file, atomically: true, encoding: .utf8)
                #expect(try sut.resolve(name) == edited)
            }
        }
    }
    @Test(arguments: [
        ("---\n{", "Metadata"),
        ("---\n{\"name\":\"Default\",\"headings\":[]}\n---\nWrite notes", "required headings"),
        ("---\n{\"name\":\"Default\"}\n---\nWrite notes", "required headings"),
        ("---\n{\"name\":\"Default\",\"headings\":[[{\"name\":\"Questions\",\"required\":false}]]}\n---\nWrite notes", "required headings"),
        ("---\n{\"name\":\"Default\",\"headings\":[[{\"name\":\"Topic\",\"required\":true}]]}\n---\n  ", "Instructions"),
    ])
    func brokenFilesAreVisibleUnchangedAndDefaultStillResolves(text: String, reason: String) throws {
        try withFolder { root in
            let file = root.appendingPathComponent("Default.md")
            try text.write(to: file, atomically: true, encoding: .utf8)
            let before = try file.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate
            let sut = Files(folder: root, disk: FileDisk())
            let listed = sut.list()
            #expect(listed.entries.count == 2)
            #expect(listed.entries[0].file == "Default.md")
            #expect(listed.entries[0].reason?.contains(reason) == true)
            #expect(listed.entries[1] == Entry(name: "Default", file: nil, reason: nil))
            #expect(try sut.resolve("Default") == Files.builtInDefault)
            #expect(try String(contentsOf: file, encoding: .utf8) == text)
            #expect(try file.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate == before)
        }
    }
    @Test func aMissingOrBrokenChosenTemplateNeverUsesDefault() throws {
        try withFolder { root in
            let file = root.appendingPathComponent("Custom.md")
            let sut = Files(folder: root, disk: FileDisk())
            let template = Template(name: "Custom", instructions: "Custom instructions", headings: [[Heading("Topic")]])
            try Files.encode(template).write(to: file, atomically: true, encoding: .utf8)
            #expect(sut.list().entries.contains(Entry(name: "Custom", file: "Custom.md", reason: nil)))
            try FileManager.default.removeItem(at: file)
            do { _ = try sut.resolve("Custom"); Issue.record("Missing template resolved") }
            catch { #expect(String(describing: error).contains("Custom")) }
            try "broken".write(to: file, atomically: true, encoding: .utf8)
            #expect(throws: Failure.self) { try sut.resolve("Custom") }
        }
    }
    @Test func unreadableFolderReportsItsReasonAndOffersDefault() throws {
        try withFolder { root in
            try FileManager.default.setAttributes([.posixPermissions: 0o000], ofItemAtPath: root.path)
            defer { try? FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: root.path) }
            let sut = Files(folder: root, disk: FileDisk())
            let listed = sut.list()
            #expect(listed.folderReason?.isEmpty == false)
            #expect(listed.entries == [Entry(name: "Default", file: nil, reason: nil)])
            #expect(try sut.resolve("Default") == Files.builtInDefault)
        }
    }
    @Test(arguments: ["../Other", "/tmp/Other", "", "..", "Other\\File"])
    func resolutionRejectsPaths(name: String) throws {
        try withFolder { root in
            #expect(throws: Failure.self) { try Files(folder: root, disk: FileDisk()).resolve(name) }
        }
    }
}
private func withFolder(_ body: (URL) throws -> Void) throws {
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: folder) }
    try body(folder)
}
