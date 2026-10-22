import Foundation
import Testing
import CallDomain

/// Call-folder-names QA scenarios (`docs/spec/call-folder-names/QA.md`).
@Suite struct CallFolderNameTests {
    @Test func s1ANewCallsFolderName() {
        #expect(CallFolderName.make(start: at(14, 30), title: "Zoom", taken: [], timeZone: zone) == "2026.10.21-1430 Zoom")
    }

    @Test func s2ReadingANameBack() {
        let made = CallFolderName.make(start: at(14, 30, 47), title: "Планёрка", taken: [], timeZone: zone)
        let numbered = CallFolderName.make(start: at(14, 30), title: "Этап 2", taken: [], timeZone: zone)

        #expect(read(made) == (at(14, 30), "Планёрка"))
        #expect(read("2026.10.21-1430 Q3-Q4 план") == (at(14, 30), "Q3-Q4 план"))
        #expect(read("2026.10.21-1430 Zoom 2") == (at(14, 30), "Zoom 2"))
        #expect(read(numbered) == (at(14, 30), "Этап 2"))
    }

    @Test func s3ANameWithoutAStartTime() {
        #expect(read("Планёрка") == (nil, "Планёрка"))
    }

    @Test func s4ATitleTakenInTheSameMinute() {
        let name = CallFolderName.make(
            start: at(14, 30), title: "Zoom", taken: ["2026.10.21-1430 Zoom"], timeZone: zone)

        #expect(name == "2026.10.21-1430 Zoom 2")
    }

    @Test func s5TwoTitlesAlreadyTaken() {
        let name = CallFolderName.make(
            start: at(14, 30), title: "Zoom", taken: ["2026.10.21-1430 Zoom", "2026.10.21-1430 Zoom 2"],
            timeZone: zone)

        #expect(name == "2026.10.21-1430 Zoom 3")
    }

    @Test func s6ATitleWithCharactersAFolderCannotHold() throws {
        let name = CallFolderName.make(start: at(14, 30), title: "Q3/Q4 план", taken: [], timeZone: zone)

        #expect(name == "2026.10.21-1430 Q3-Q4 план")
        let folder = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathComponent(name)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        #expect(FileManager.default.fileExists(atPath: folder.path))
    }
}

private let zone = TimeZone(identifier: "Europe/Moscow")!

private func at(_ hour: Int, _ minute: Int, _ second: Int = 0) -> Date {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = zone
    return calendar.date(from: DateComponents(year: 2026, month: 10, day: 21, hour: hour, minute: minute, second: second))!
}

private func read(_ name: String) -> (Date?, String) {
    CallFolderName.read(name, timeZone: zone)
}
