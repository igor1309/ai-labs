@testable import CallsRehearsalSupport
import Foundation
import SummaryRuntime
import Testing

@Suite(.timeLimit(.minutes(1)))
struct LiveSummaryServiceTests {
    /// Contract test: the launch runtime consumes its real file control channel without a model or network.
    @Test func launchRuntimeReturnsTheControlledNotes() async throws {
        try await withRehearsalFolder { root in
            let launch = try CallsRehearsalOptions.parse(["--calls", root.appendingPathComponent("calls").path, "--state", root.appendingPathComponent("state").path])
            try launch.prepare()
            try Data().write(to: launch.controlFolder.appendingPathComponent("finish-1"))
            let runtime = launch.runtime()
            let configuration = Configuration(kind: .compatibleAPI, model: "live-fixture", program: "",
                                              endpoint: "http://127.0.0.1:1", credentialVariable: "")
            try await runtime.validate(configuration)
            #expect(try await runtime.generate(configuration, prompt: "fixture transcript") == LiveSummaryService.notes)
            #expect(FileManager.default.fileExists(atPath: launch.controlFolder.appendingPathComponent("completed-1").path))
        }
    }

    @Test func eachRequestWaitsForItsOwnReleaseAndReturnsFixedNotes() async throws {
        let started = Signal(), release = Signal(), reports = Values<String>()
        let service = LiveSummaryService(wait: { request in
            reports.append("wait-\(request)"); started.send()
            await release.next()
        }, report: { request, stage in reports.append("\(stage.rawValue)-\(request)") })
        for request in 1...2 {
            let task = Task { try await service.request(url: URL(string: "http://127.0.0.1:1")!, headers: [:], body: Data(), loopback: true) }
            await started.next()
            #expect(reports.all.last == "wait-\(request)")
            #expect(!reports.all.contains("completed-\(request)"))
            release.send()
            let response = try await task.value
            #expect(try Runtime.api(response) == LiveSummaryService.notes)
            #expect(reports.all.last == "completed-\(request)")
        }
    }

    @Test func cancelledRequestCannotReturnNotesEvenIfReleased() async throws {
        let started = Signal(), release = Signal(), reports = Values<String>()
        let service = LiveSummaryService(wait: { _ in started.send(); await release.next() },
            report: { request, stage in reports.append("\(stage.rawValue)-\(request)") })
        let task = Task { try await service.request(url: URL(string: "http://127.0.0.1:1")!, headers: [:], body: Data(), loopback: true) }
        await started.next()
        task.cancel()
        release.send()
        await #expect(throws: CancellationError.self) { try await task.value }
        #expect(reports.all == ["started-1", "cancelled-1"])
    }

    /// Contract test: the fake service completes through its real filesystem control channel.
    @Test func completionFileReleasesThePendingRequest() async throws {
        try await withRehearsalFolder { root in
            let control = SummaryFileControl(folder: root), started = Signal()
            let service = LiveSummaryService(wait: control.wait, report: { request, stage in
                try control.report(request, stage)
                if stage == .started { started.send() }
            })
            let task = Task { try await service.request(url: URL(string: "http://127.0.0.1:1")!, headers: [:], body: Data(), loopback: true) }
            await started.next()
            #expect(FileManager.default.fileExists(atPath: root.appendingPathComponent("started-1").path))
            try Data().write(to: root.appendingPathComponent("finish-1"))
            #expect(try Runtime.api(await task.value) == LiveSummaryService.notes)
            #expect(FileManager.default.fileExists(atPath: root.appendingPathComponent("completed-1").path))
        }
    }

    /// Contract test: cancelling a file-controlled request records cancellation without notes.
    @Test func cancellationWritesItsMarkerWithoutCompletion() async throws {
        try await withRehearsalFolder { root in
            let control = SummaryFileControl(folder: root), started = Signal()
            let service = LiveSummaryService(wait: control.wait, report: { request, stage in
                try control.report(request, stage)
                if stage == .started { started.send() }
            })
            let task = Task { try await service.request(url: URL(string: "http://127.0.0.1:1")!, headers: [:], body: Data(), loopback: true) }
            await started.next()
            task.cancel()
            await #expect(throws: CancellationError.self) { try await task.value }
            #expect(FileManager.default.fileExists(atPath: root.appendingPathComponent("cancelled-1").path))
            #expect(!FileManager.default.fileExists(atPath: root.appendingPathComponent("completed-1").path))
        }
    }

    /// Contract test: directory notifications release the runtime's file control channel.
    @Test func fileControlAcceptsAnExistingCompletionAndCancellation() async throws {
        try await withRehearsalFolder { root in
            let control = SummaryFileControl(folder: root)
            try Data().write(to: root.appendingPathComponent("finish-1"))
            try await control.wait(1)
            let task = Task { try await control.wait(2) }
            task.cancel()
            await #expect(throws: CancellationError.self) { try await task.value }
        }
    }
}

