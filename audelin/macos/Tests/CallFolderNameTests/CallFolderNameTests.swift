import CallFolderName
import Foundation
import Testing

@Suite(.timeLimit(.minutes(1)))
struct CallFolderNameTests {

    @Test func idIsTheLocalTimestampAndANumberFromTwo() {

        #expect(CallFolderName.id(at: start, timeZone: tokyo) == "2026.10.24-1405")
        #expect(CallFolderName.id(at: start, number: 2, timeZone: tokyo) == "2026.10.24-1405-2")
        #expect(CallFolderName.id(at: start, timeZone: .gmt) == "2026.10.24-0505")
    }

    @Test(arguments: [
        (1, nil, "2026.10.24-1405", ""),
        (1, "", "2026.10.24-1405", ""),
        (1, "Zoom", "2026.10.24-1405 Zoom", "Zoom"),
        (2, "Zoom call", "2026.10.24-1405-2 Zoom call", "Zoom call"),
        (12, "a/b:c", "2026.10.24-1405-12 a-b-c", "a-b-c"),
    ] as [(Int, String?, String, String)])
    func aMadeNameReadsBack(number: Int, title: String?, name: String, readTitle: String) throws {

        let id = CallFolderName.id(at: start, number: number, timeZone: tokyo)
        #expect(CallFolderName.name(id: id, title: title) == name)
        let read = try #require(CallFolderName(name, timeZone: tokyo))
        #expect(read.id == id)
        #expect(read.title == readTitle)
        #expect(read.start == Date(timeIntervalSince1970: floor(start.timeIntervalSince1970 / 60) * 60))
    }

    @Test(arguments: [
        "", "notes", "2026.10.24", "2026.10.24-1405x", "2026.10.24-1405-1", "2026.10.24-1405-0 Zoom",
        "2026.13.24-1405", "2026.02.30-1405", "2026.10.24-2460", "x2026.10.24-1405",
    ])
    func anythingElseIsNotACallName(name: String) {

        #expect(CallFolderName(name, timeZone: tokyo) == nil)
    }
}

private let start = Date(timeIntervalSince1970: 1_792_818_330)
private let tokyo = TimeZone(identifier: "Asia/Tokyo")!
