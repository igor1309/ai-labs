import CallAppProcesses
import Synchronization
import Testing

struct CallAppProcessesTests {

    @Test(arguments: [
        ("us.zoom", "us.zoom.xos", "zoom"),
        ("Zoom", "us.zoom.xos", "Zoom"),
    ])
    func theCallAppsOwnProcessIsChosen(app: String, bundleID: String, name: String) throws {

        let list = FakeProcessList([[process(41, bundleID, name)]])
        let processes = CallAppProcesses(app: app, list: list)

        #expect(try processes.processes() == .only([41]))
    }

    @Test(arguments: [
        ("com.google.Chrome", "com.google.Chrome.helper.Renderer", "Chrome Helper (Renderer)"),
        ("Comet", "ai.perplexity.comet.helper.renderer", "Comet Helper (Renderer)"),
    ])
    func theCallAppsHelpersAreChosen(app: String, bundleID: String, name: String) throws {

        let list = FakeProcessList([[
            process(82, bundleID, name),
            process(19, bundleID + ".second", name),
        ]])
        let processes = CallAppProcesses(app: app, list: list)

        #expect(try processes.processes() == .only([82, 19]))
    }

    @Test func anotherAppIsLeftOut() throws {

        let list = FakeProcessList([[
            process(12, "com.apple.Music", "Music"),
            process(41, "us.zoom.xos", "Zoom"),
            process(23, "com.apple.Safari", "Safari"),
        ]])
        let processes = CallAppProcesses(app: "us.zoom", list: list)

        #expect(try processes.processes() == .only([41]))
    }

    @Test(arguments: [
        ("ai.cometary.helper", "Cometary"),
        ("ai.perplexity.comet.renderer", "Comet Helper"),
        (nil, "Comet Helper"),
        ("", "Comet Helper"),
        ("ai.perplexity.comet.helper", "CometHelper"),
        ("ai.perplexity.comet.helper", "comet Helper"),
    ])
    func anAppWithASimilarNameIsLeftOut(bundleID: String?, name: String) throws {

        let list = FakeProcessList([[
            process(12, bundleID, name),
            process(41, "ai.perplexity.comet", "Comet"),
        ]])
        let processes = CallAppProcesses(app: "Comet", list: list)

        #expect(try processes.processes() == .only([41]))
    }

    @Test(arguments: [nil, ""] as [String?])
    func aProcessWithNoBundleIDIsFoundByName(bundleID: String?) throws {

        let list = FakeProcessList([[
            process(12, bundleID, "zoom-cli-helper"),
            process(41, bundleID, "zoom-cli"),
        ]])
        let processes = CallAppProcesses(app: "zoom-cli", list: list)

        #expect(try processes.processes() == .only([41]))
    }

    @Test func withTheCallAppNotRunningAllButAudelinIsChosen() throws {

        let list = FakeProcessList([[
            process(12, "com.apple.Music", "Music"),
            process(90, "com.example.Audelin", "Audelin", isAudelin: true),
            process(23, nil, "afplay"),
            process(17, nil, "Audelin Helper", isAudelin: true),
        ]])
        let processes = CallAppProcesses(app: "us.zoom", list: list)

        #expect(try processes.processes() == .allExcept([90, 17]))
    }

    @Test func aHelperOpenedLaterIsChosen() throws {

        let chrome = process(41, "com.google.Chrome", "Chrome")
        let helper = process(19, "com.google.Chrome.helper.Renderer", "Chrome Helper (Renderer)")
        let list = FakeProcessList([[chrome], [helper, chrome], [helper]])
        let processes = CallAppProcesses(app: "com.google.Chrome", list: list)

        #expect(try processes.processes() == .only([41]))
        #expect(try processes.processes() == .only([19, 41]))
        #expect(try processes.processes() == .only([19]))
    }

    @Test(arguments: [true, false])
    func aCallAppThatLeavesKeepsItsAnswer(started: Bool) throws {

        let first = started
            ? process(41, "us.zoom.xos", "Zoom")
            : process(90, "com.example.Audelin", "Audelin", isAudelin: true)
        let list = FakeProcessList([
            [first], [], [process(17, nil, "Audelin Helper", isAudelin: true)],
        ])
        let processes = CallAppProcesses(app: "us.zoom", list: list)
        let expected: ProcessSelection = started ? .only([41]) : .allExcept([90])

        #expect(try processes.processes() == expected)
        #expect(try processes.processes() == expected)
        #expect(try processes.processes() == expected)
    }

    @Test(arguments: [
        ([process(41, "com.google.Chrome", "Chrome")], ProcessSelection.only([41])),
        ([process(90, "com.example.Audelin", "Audelin", isAudelin: true)], ProcessSelection.allExcept([90])),
    ])
    func aCallAppThatLeavesKeepsItsLatestAnswer(first: [AudioProcess], firstAnswer: ProcessSelection) throws {

        let helper = process(19, "com.google.Chrome.helper.Renderer", "Chrome Helper (Renderer)")
        let list = FakeProcessList([first, [helper], []])
        let processes = CallAppProcesses(app: "com.google.Chrome", list: list)

        #expect(try processes.processes() == firstAnswer)
        #expect(try processes.processes() == .only([19]))
        #expect(try processes.processes() == .only([19]))
    }

    @Test func aCallAppThatStartsAfterIsChosen() throws {

        let audelin = process(90, "com.example.Audelin", "Audelin", isAudelin: true)
        let list = FakeProcessList([
            [audelin, process(12, "com.apple.Music", "Music")],
            [audelin, process(41, "us.zoom.xos", "Zoom")],
        ])
        let processes = CallAppProcesses(app: "us.zoom", list: list)

        #expect(try processes.processes() == .allExcept([90]))
        #expect(try processes.processes() == .only([41]))
    }

    @Test(arguments: [0, 1, 2])
    func aListThatFailsIsTold(previous: Int) throws {

        let failure = ListFailure()
        var answers: [Result<[AudioProcess], any Error>] = []
        let expected: ProcessSelection
        switch previous {
        case 1:
            answers.append(.success([process(41, "us.zoom.xos", "Zoom")]))
            expected = .only([41])
        case 2:
            answers.append(.success([process(90, nil, "Audelin", isAudelin: true)]))
            expected = .allExcept([90])
        default:
            expected = .allExcept([])
        }
        answers += [.failure(failure), .success([]), .success([process(23, "us.zoom.xos", "Zoom")])]
        let processes = CallAppProcesses(app: "us.zoom", list: FakeProcessList(answers: answers))
        if previous != 0 {
            #expect(try processes.processes() == expected)
        }

        do {
            _ = try processes.processes()
            Issue.record("A refused process list must throw")
        } catch {
            #expect((error as? ListFailure) === failure)
        }

        #expect(try processes.processes() == expected)
        #expect(try processes.processes() == .only([23]))
    }
}

private func process(_ pid: Int32, _ bundleID: String?, _ name: String, isAudelin: Bool = false) -> AudioProcess {

    AudioProcess(pid: pid, bundleID: bundleID, name: name, isAudelin: isAudelin)
}

private final class ListFailure: Error {}

private final class FakeProcessList: ProcessList {

    private let answers: Mutex<[Result<[AudioProcess], any Error>]>

    init(_ lists: [[AudioProcess]]) {

        answers = Mutex(lists.map { .success($0) })
    }

    init(answers: [Result<[AudioProcess], any Error>]) {

        self.answers = Mutex(answers)
    }

    func processes() throws -> [AudioProcess] {

        try answers.withLock { answers in
            precondition(!answers.isEmpty, "Each ask needs a hand-made process list")
            return try answers.removeFirst().get()
        }
    }
}
