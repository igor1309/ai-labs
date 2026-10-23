import Testing
@testable import SystemAudioCapture

struct SystemAudioCaptureTests {

    @Test func aNamedProcessIsHeardWithoutMutingPlayback() async throws {

        let binding = FakeCaptureBinding()
        let capture = try SystemAudioCapture(binding: binding, processes: .only([10]))
        binding.play([10])
        capture.stop()
        let pieces = try await drain(capture)
        #expect(binding.taps == [TapRequest(selection: .only([10]), mono: true, unmuted: true, isPrivate: true)])
        #expect(binding.devices == [DeviceRequest(tap: 11, isPrivate: true, autoStart: false)])
        #expect(binding.events.contains("start"))
        try expectTone(pieces, pid: 10)
    }

    @Test func newlyNamedProcessesAreHeardInTheSameCapture() async throws {

        let binding = FakeCaptureBinding()
        let capture = try SystemAudioCapture(binding: binding, processes: .only([10]))
        binding.play([10, 20])
        try capture.name(.only([20]))
        binding.play([10, 20])
        capture.stop()
        let pieces = try await drain(capture)
        try #require(pieces.count == 2)
        try expectTone([pieces[0]], pid: 10)
        try expectTone([pieces[1]], pid: 20)
        #expect(magnitude(pieces[1].samples, frequency: 1_000, rate: 48_000) < 0.0001)
        #expect(binding.events.filter { $0 == "start" }.count == 1)
        #expect(binding.events.filter { $0 == "tap" }.count == 1)
    }

    @Test func aNewOutputDeviceChangesThePiecesRate() async throws {

        let binding = FakeCaptureBinding()
        let capture = try SystemAudioCapture(binding: binding, processes: .only([10]))
        binding.play([10])
        binding.changeRate(to: 24_000)
        binding.play([10])
        capture.stop()
        let pieces = try await drain(capture)
        #expect(pieces.map(\.sampleRate) == [48_000, 24_000])
        try expectTone(pieces, pid: 10)
    }

    @Test(arguments: ["tap", "device", "format", "io", "watch", "start"])
    func eachRefusedStartingStepFailsAndReleasesItsResources(step: String) throws {

        let binding = FakeCaptureBinding()
        binding.refuse(step)
        #expect(throws: Refusal.self) {
            _ = try SystemAudioCapture(binding: binding, processes: .only([10]))
        }
        let steps = ["tap", "device", "format", "io", "watch", "start"]
        let index = steps.firstIndex(of: step)!
        var expected = Array(steps.prefix(index + 1))
        if index > 4 { expected.append("unwatch") }
        if index > 3 { expected.append("remove io") }
        if index > 1 { expected.append("destroy device") }
        if index > 0 { expected.append("destroy tap") }
        #expect(binding.events == expected)
    }

    @Test func aSystemStopReportsFailure() async throws {

        let binding = FakeCaptureBinding()
        let capture = try SystemAudioCapture(binding: binding, processes: .only([10]))
        binding.play([10])
        binding.systemStops()
        capture.stop()
        var failure: CaptureError?
        do {
            for try await _ in capture.audio {}
        } catch { failure = error as? CaptureError }
        #expect(failure == .deviceStopped)
    }

    @Test func aFailedCaptureKeepsEveryPieceItHeard() async throws {

        let binding = FakeCaptureBinding()
        let capture = try SystemAudioCapture(binding: binding, processes: .allExcept([]))
        binding.play([10])
        binding.play([20])
        binding.play([30])
        binding.systemStops()
        capture.stop()
        var pieces: [AudioPiece] = []
        var failed = false
        do {
            for try await piece in capture.audio { pieces.append(piece) }
        } catch { failed = true }
        #expect(failed)
        try #require(pieces.count == 3)
        for (piece, pid) in zip(pieces, [Int32(10), 20, 30]) {
            try expectTone([piece], pid: pid)
        }
    }

    @Test func stoppingEndsAudioAndReleasesInReverseOrder() async throws {

        let binding = FakeCaptureBinding()
        let capture = try SystemAudioCapture(binding: binding, processes: .only([10]))
        binding.play([10])
        capture.stop()
        capture.stop()
        binding.play([10])
        let pieces = try await drain(capture)
        #expect(pieces.count == 1)
        #expect(Array(binding.events.suffix(5)) == ["stop", "unwatch", "remove io", "destroy device", "destroy tap"])
        #expect(binding.events.filter { $0 == "destroy tap" }.count == 1)
    }

    @Test func anotherCaptureCanFollowAStoppedOne() async throws {

        let binding = FakeCaptureBinding()
        let first = try SystemAudioCapture(binding: binding, processes: .only([10]))
        first.stop()
        #expect(try await drain(first).isEmpty)
        let second = try SystemAudioCapture(binding: binding, processes: .only([20]))
        binding.play([20])
        second.stop()
        try expectTone(try await drain(second), pid: 20)
        #expect(binding.events.filter { $0 == "start" }.count == 2)
    }

    @Test func anIntentionalStopNotificationDoesNotFailTheStream() async throws {

        let binding = FakeCaptureBinding()
        binding.state.withLock { $0.notifyOnStop = true }
        let capture = try SystemAudioCapture(binding: binding, processes: .only([10]))
        binding.play([10])
        capture.stop()
        var pieces: [AudioPiece] = []
        var failed = false
        do { pieces = try await drain(capture) } catch { failed = true }
        #expect(!failed)
        try expectTone(pieces, pid: 10)
    }

    @Test func aCaptureThatHeardNothingEndsCleanly() async throws {

        let binding = FakeCaptureBinding()
        let capture = try SystemAudioCapture(binding: binding, processes: .only([]))
        capture.stop()
        #expect(try await drain(capture).isEmpty)
        #expect(binding.events.contains("destroy tap"))
    }

    @Test func anUnnamedProcessIsLeftOut() async throws {

        let binding = FakeCaptureBinding()
        let capture = try SystemAudioCapture(binding: binding, processes: .only([10]))
        binding.play([10, 20])
        capture.stop()
        let pieces = try await drain(capture)
        try expectTone(pieces, pid: 10)
        #expect(pieces.allSatisfy { magnitude($0.samples, frequency: 2_000, rate: $0.sampleRate) < 0.0001 })
    }

    @Test func anExcludedProcessIsNotHeard() async throws {

        let binding = FakeCaptureBinding()
        let capture = try SystemAudioCapture(binding: binding, processes: .allExcept([20]))
        binding.play([10, 20])
        capture.stop()
        let pieces = try await drain(capture)
        try expectTone(pieces, pid: 10)
        #expect(binding.taps.first?.selection == .allExcept([20]))
        #expect(pieces.allSatisfy { magnitude($0.samples, frequency: 2_000, rate: $0.sampleRate) < 0.0001 })
    }

    @Test func aProcessStartingLaterIsHeard() async throws {

        let binding = FakeCaptureBinding()
        let capture = try SystemAudioCapture(binding: binding, processes: .allExcept([20]))
        binding.play([10])
        binding.play([30])
        capture.stop()
        let pieces = try await drain(capture)
        try #require(pieces.count == 2)
        try expectTone([pieces[1]], pid: 30)
    }

    @Test func aRefusedNamingKeepsTheFirstNaming() async throws {

        let binding = FakeCaptureBinding()
        let capture = try SystemAudioCapture(binding: binding, processes: .only([10]))
        binding.refuse("rename")
        #expect(throws: Refusal.self) { try capture.name(.only([20])) }
        binding.play([10, 20])
        capture.stop()
        let pieces = try await drain(capture)
        try expectTone(pieces, pid: 10)
        #expect(pieces.allSatisfy { magnitude($0.samples, frequency: 2_000, rate: $0.sampleRate) < 0.0001 })
    }
}

func drain(_ capture: SystemAudioCapture) async throws -> [AudioPiece] {

    var pieces: [AudioPiece] = []
    for try await piece in capture.audio { pieces.append(piece) }
    return pieces
}

func expectTone(_ pieces: [AudioPiece], pid: Int32) throws {

    try #require(!pieces.isEmpty)
    for piece in pieces {
        #expect(abs(magnitude(piece.samples, frequency: Double(pid) * 100, rate: piece.sampleRate) - 0.25) < 0.0001)
    }
}
