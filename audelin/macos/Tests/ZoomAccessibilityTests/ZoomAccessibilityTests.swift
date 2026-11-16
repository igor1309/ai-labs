import Foundation
import Testing
import ZoomAccessibility

@Suite struct ZoomAccessibilityTests {
    @Test func recordedScreenShareShowsWhoIsTalkingAndHowManyAreIn() throws {
        let reading = ZoomReading.read(windows: try fixture("screen-share-talking"))
        #expect(reading == Reading(inMeeting: true, talking: "Анна Петрова", participantCount: 15))
    }
    @Test func withoutTheMeetingWindowNothingIsObserved() throws {
        let windows = try fixture("screen-share-talking").filter { $0.identifier != "zm.meeting.window.main" && $0.title != "zoom floating video window" }
        #expect(ZoomReading.read(windows: windows) == Reading(inMeeting: false, talking: nil, participantCount: nil))
    }
    @Test func theFloatingWindowAloneStillCountsAsTheMeeting() throws {
        let windows = try fixture("screen-share-talking").filter { $0.identifier != "zm.meeting.window.main" }
        #expect(ZoomReading.read(windows: windows) == Reading(inMeeting: true, talking: "Анна Петрова", participantCount: nil))
    }
    @Test func anEmptyTalkingLabelMeansNobody() {
        let windows = [Node(role: "AXWindow", identifier: "zm.meeting.window.main", children: [Node(role: "AXStaticText", value: "Talking: ")])]
        #expect(ZoomReading.read(windows: windows).talking == nil)
    }
    @Test func recordedGalleryCallAloneShowsMyNameAndTile() throws {
        let reading = ZoomReading.read(windows: try fixture("gallery-alone"))
        #expect(reading.ownName == "Анна Петрова")
        #expect(reading.tiles == [.init(name: "Анна Петрова", unmuted: false)])
        #expect(reading.talking == nil)
    }
    @Test func recordedGalleryCallWithOneOtherNamesThemByMyRememberedName() throws {
        let reading = ZoomReading.read(windows: try fixture("gallery-one-other"))
        #expect(reading.talking == nil && reading.ownName == nil)
        #expect(reading.tiles == [.init(name: "Борис Смирнов", unmuted: true), .init(name: "Анна Петрова", unmuted: true)])
        #expect(ZoomReading.speaker(in: reading, known: "Анна Петрова") == "Борис Смирнов")
        #expect(ZoomReading.speaker(in: reading, known: nil) == nil)
    }
    @Test func theOnlyUnmutedOtherSpeaksInALargerCall() {
        let reading = gallery([("Me", true), ("Anna", true), ("Boris", false), ("Vera", false)])
        #expect(ZoomReading.speaker(in: reading, known: "Me") == "Anna")
    }
    @Test func severalUnmutedOthersNameNobody() {
        let reading = gallery([("Me", false), ("Anna", true), ("Boris", true)])
        #expect(ZoomReading.speaker(in: reading, known: "Me") == nil)
    }
    @Test func noUnmutedOtherNamesNobody() {
        let reading = gallery([("Me", true), ("Anna", false), ("Boris", false)])
        #expect(ZoomReading.speaker(in: reading, known: "Me") == nil)
    }
    @Test func aRememberedNameWithoutItsTileNamesNobody() {
        let reading = gallery([("Me (renamed)", true), ("Anna", true)])
        #expect(ZoomReading.speaker(in: reading, known: "Me") == nil)
    }
    @Test func theTalkingLabelWinsOverTheUnmutedRule() {
        var reading = gallery([("Me", false), ("Anna", false), ("Boris", true)])
        reading.talking = "Anna"
        #expect(ZoomReading.speaker(in: reading, known: "Me") == "Anna")
    }
    @Test func theTalkingLabelNamesWithoutMyName() {
        var reading = gallery([("Me", false), ("Anna", true)])
        reading.talking = "Anna"
        #expect(ZoomReading.speaker(in: reading, known: nil) == "Anna")
    }
    @Test func theTalkingLabelNeverNamesMe() {
        var reading = gallery([("Me", true), ("Anna", false)])
        reading.talking = "Me"
        #expect(ZoomReading.speaker(in: reading, known: "Me") == nil)
    }
    @Test func theNameZoomShowsWinsOverTheRememberedOne() {
        var reading = gallery([("Me", true), ("Old", true)])
        reading.ownName = "Me"
        #expect(ZoomReading.speaker(in: reading, known: "Old") == "Old")
    }
    @Test func outsideAMeetingNobodySpeaks() {
        var reading = gallery([("Me", true), ("Anna", true)])
        reading.inMeeting = false
        #expect(ZoomReading.speaker(in: reading, known: "Me") == nil)
    }
    @Test func tilesOutsideTheMeetingWindowAreNotRead() {
        let windows = [Node(role: "AXWindow", title: "Zoom Workplace", children: [
            Node(role: "AXTabGroup", description: "Anna, Computer audio unmuted, Video off"),
        ])]
        #expect(ZoomReading.read(windows: windows).tiles.isEmpty)
    }
    @Test func aTileNameWithACommaIsKeptWhole() {
        let windows = [Node(role: "AXWindow", identifier: "zm.meeting.window.main", children: [
            Node(role: "AXTabGroup", description: "Smith, Anna, No audio connected, Video off"),
        ])]
        #expect(ZoomReading.read(windows: windows).tiles == [.init(name: "Smith, Anna", unmuted: false)])
    }
    @Test func aTileSpeakerChangeIsReportedWithTheRememberedName() {
        var transitions = Transitions()
        #expect(transitions.next(gallery([("Me", true)]), known: "Me") == [.observed])
        #expect(transitions.next(gallery([("Me", true), ("Anna", true)]), known: "Me") == [.started(name: "Anna"), .observed])
        #expect(transitions.next(gallery([("Me", true), ("Anna", true), ("Boris", true)]), known: "Me") == [.stopped(name: "Anna"), .observed])
    }
    @Test func aChangeOfSpeakerStopsOneAndStartsTheOther() {
        var transitions = Transitions()
        #expect(transitions.next(.init(inMeeting: true, talking: "A", participantCount: 3)) == [.started(name: "A"), .observed])
        #expect(transitions.next(.init(inMeeting: true, talking: "A", participantCount: 3)) == [.observed])
        #expect(transitions.next(.init(inMeeting: true, talking: "B", participantCount: 3)) == [.stopped(name: "A"), .started(name: "B"), .observed])
        #expect(transitions.next(.init(inMeeting: true, talking: nil, participantCount: 3)) == [.stopped(name: "B"), .observed])
    }
    @Test func leavingTheMeetingStopsTheSpeakerAndIsLost() {
        var transitions = Transitions()
        _ = transitions.next(.init(inMeeting: true, talking: "A", participantCount: 3))
        #expect(transitions.next(.init(inMeeting: false, talking: nil, participantCount: nil)) == [.stopped(name: "A"), .lost])
        #expect(transitions.next(.init(inMeeting: false, talking: nil, participantCount: nil)) == [])
    }
}

private func gallery(_ tiles: [(String, Bool)]) -> Reading {
    Reading(inMeeting: true, talking: nil, participantCount: tiles.count, tiles: tiles.map { .init(name: $0.0, unmuted: $0.1) })
}

/// Reads a probe dump (`docs/research/probes/zoom-ax.swift`): two spaces per depth, `Key=Value` fields.
private func fixture(_ name: String) throws -> [Node] {
    let url = try #require(Bundle.module.url(forResource: name, withExtension: "txt", subdirectory: "Fixtures"))
    var stack: [(depth: Int, node: Node)] = []
    var roots: [Node] = []
    func pop(to depth: Int) {
        while let last = stack.last, last.depth >= depth {
            stack.removeLast()
            if stack.isEmpty { roots.append(last.node) } else { stack[stack.count - 1].node.children.append(last.node) }
        }
    }
    for line in try String(contentsOf: url, encoding: .utf8).split(separator: "\n") {
        let depth = line.prefix(while: { $0 == " " }).count / 2
        pop(to: depth)
        stack.append((depth, node(fields(String(line.drop(while: { $0 == " " }))))))
    }
    pop(to: 0)
    return roots
}

private func fields(_ line: String) -> [String: String] {
    let keys = ["Role", "Subrole", "Title", "Description", "Value", "Identifier", "Help"]
    var result: [String: String] = [:]
    var rest = Substring(line)
    var key: String?
    while !rest.isEmpty {
        let next = keys.compactMap { k in rest.range(of: (key == nil ? "" : " ") + k + "=").map { ($0, k) } }.min { $0.0.lowerBound < $1.0.lowerBound }
        if let key { result[key] = String(next.map { rest[..<$0.0.lowerBound] } ?? rest) }
        guard let next else { break }
        key = next.1
        rest = rest[next.0.upperBound...]
    }
    return result
}

private func node(_ fields: [String: String]) -> Node {
    Node(role: fields["Role"] ?? "", title: fields["Title"], identifier: fields["Identifier"], description: fields["Description"], value: fields["Value"])
}
